import express from 'express';
import http from 'http';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import apiRouter from './server/api.ts';
import { initFirestoreDb, probeFirestoreRules } from './server/db.ts';

async function startServer() {
  // Initialize Firestore database connection and initial migration/loading
  await initFirestoreDb();
  // Fail loudly (not silently) if the deployed security rules block a
  // collection the app depends on — e.g. correctionRequests would make a
  // cashier's "Flag Fix" request disappear without any error.
  await probeFirestoreRules();

  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);
  const httpServer = http.createServer(app);

  // Parse JSON payloads
  app.use(express.json());

  // Mount backend API routes
  app.use('/api', apiRouter);

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Game Lounge System running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

