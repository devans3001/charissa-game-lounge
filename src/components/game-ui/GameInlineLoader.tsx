import React from 'react';
import { DotPulse, Ring2, LineWobble } from 'ldrs/react';

interface GameInlineLoaderProps {
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'ring' | 'pulse' | 'wobble';
  color?: string;
}

export function GameInlineLoader({
  label,
  size = 'sm',
  variant = 'ring',
  color = '#818cf8',
}: GameInlineLoaderProps) {
  const sizeMap = {
    sm: 18,
    md: 24,
    lg: 32,
  };

  return (
    <div className="inline-flex items-center gap-2 font-mono text-xs">
      {variant === 'ring' && (
        <Ring2 size={sizeMap[size]} stroke={3} strokeLength={0.25} bgOpacity={0.1} speed={0.8} color={color} />
      )}
      {variant === 'pulse' && (
        <DotPulse size={sizeMap[size] + 12} speed={1.3} color={color} />
      )}
      {variant === 'wobble' && (
        <LineWobble size={sizeMap[size] + 20} stroke={3} speed={1.75} color={color} />
      )}
      {label && <span className="tracking-wide text-inherit">{label}</span>}
    </div>
  );
}
