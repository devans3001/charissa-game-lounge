import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { readDb } from './db.ts';
import { User, UserRole } from '../src/types/index.ts';

const JWT_SECRET = process.env.JWT_SECRET || 'gamelounge_secret_key_abuja_lagos_2026';

export interface AuthRequest extends Request {
  user?: User;
}

export function generateToken(user: User): string {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: '12h' }
  );
}

export function verifyToken(token: string): any {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or malformed Authorization header' });
    return;
  }

  const token = authHeader.split(' ')[1];
  const payload = verifyToken(token);

  if (!payload || !payload.id) {
    res.status(401).json({ error: 'Invalid or expired session token' });
    return;
  }

  const db = await readDb();
  const user = db.users.find(u => u.id === payload.id);

  if (!user) {
    res.status(401).json({ error: 'User account no longer exists' });
    return;
  }

  if (!user.isActive) {
    res.status(403).json({ error: 'Account has been deactivated by administrator' });
    return;
  }

  req.user = {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    isActive: user.isActive,
    phoneNumber: user.phoneNumber,
    mustChangePassword: user.mustChangePassword,
    createdBy: user.createdBy,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  };

  next();
}

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: `Access denied. Authorized roles: ${allowedRoles.join(', ')} (Your role: ${req.user?.role || 'None'})`,
      });
      return;
    }
    next();
  };
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'ADMIN') {
    res.status(403).json({ error: 'Administrative privileges required for this action' });
    return;
  }
  next();
}

export function requireDeveloper(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'DEVELOPER') {
    res.status(403).json({ error: 'Developer access required for this action' });
    return;
  }
  next();
}

export function requireAdminOrDeveloper(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user || (req.user.role !== 'ADMIN' && req.user.role !== 'DEVELOPER')) {
    res.status(403).json({ error: 'Admin or Developer access required for this action' });
    return;
  }
  next();
}

export function requireFinancialOrAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user || (req.user.role !== 'ADMIN' && req.user.role !== 'ACCOUNTANT' && req.user.role !== 'DEVELOPER')) {
    res.status(403).json({ error: 'Financial reporting access required for this action' });
    return;
  }
  next();
}
