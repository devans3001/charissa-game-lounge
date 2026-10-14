import React from 'react';

interface GameCardSkeletonProps {
  count?: number;
  columns?: string; // e.g. "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
}

export function GameCardSkeleton({ count = 4, columns = 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4' }: GameCardSkeletonProps) {
  return (
    <div className={`grid ${columns} gap-4`}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="relative bg-slate-900/90 border border-slate-800 rounded-xl p-5 overflow-hidden animate-scan-sweep"
        >
          {/* Cyber HUD Corner Brackets */}
          <div className="absolute top-1.5 left-1.5 w-2 h-2 border-t-2 border-l-2 border-indigo-500/40" />
          <div className="absolute top-1.5 right-1.5 w-2 h-2 border-t-2 border-r-2 border-indigo-500/40" />
          <div className="absolute bottom-1.5 left-1.5 w-2 h-2 border-b-2 border-l-2 border-indigo-500/40" />
          <div className="absolute bottom-1.5 right-1.5 w-2 h-2 border-b-2 border-r-2 border-indigo-500/40" />

          {/* Top header line */}
          <div className="flex items-center justify-between mb-3">
            <div className="h-3 w-24 bg-slate-800/80 rounded animate-pulse" />
            <div className="w-8 h-8 rounded-lg bg-indigo-950/40 border border-indigo-900/30 flex items-center justify-center animate-pulse">
              <div className="w-4 h-4 bg-indigo-500/20 rounded" />
            </div>
          </div>

          {/* Main Stat / Value */}
          <div className="h-7 w-36 bg-slate-800/90 rounded mb-3 animate-pulse" />

          {/* Subtext telemetry */}
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-16 bg-slate-800/60 rounded" />
            <div className="h-2.5 w-24 bg-slate-800/40 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
