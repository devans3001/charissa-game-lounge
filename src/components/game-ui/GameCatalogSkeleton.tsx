import React from 'react';
import { Gamepad2, Coins } from 'lucide-react';
import { Superballs } from 'ldrs/react';

interface GameCatalogSkeletonProps {
  count?: number;
}

export function GameCatalogSkeleton({ count = 8 }: GameCatalogSkeletonProps) {
  return (
    <div className="space-y-4">
      {/* Category selector skeleton */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {['ALL GAMES', 'PLAYSTATION', 'COIN ARCADE', 'VR ARENA', 'POOL / SNOOKER'].map((cat, i) => (
          <div
            key={i}
            className="px-3.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-400 font-mono text-xs flex items-center gap-2 animate-pulse"
          >
            <div className="w-2 h-2 rounded-full bg-slate-700" />
            <span>{cat}</span>
          </div>
        ))}
      </div>

      {/* Grid of game cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className="relative bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 overflow-hidden animate-scan-sweep flex flex-col justify-between h-40"
          >
            {/* Corner retro brackets */}
            <div className="absolute top-1 left-1 w-1.5 h-1.5 border-t border-l border-indigo-500/40" />
            <div className="absolute top-1 right-1 w-1.5 h-1.5 border-t border-r border-indigo-500/40" />
            <div className="absolute bottom-1 left-1 w-1.5 h-1.5 border-b border-l border-indigo-500/40" />
            <div className="absolute bottom-1 right-1 w-1.5 h-1.5 border-b border-r border-indigo-500/40" />

            <div>
              {/* Category pill placeholder */}
              <div className="flex items-center justify-between mb-2">
                <div className="h-3 w-16 bg-slate-800 rounded animate-pulse" />
                <div className="w-5 h-5 rounded bg-indigo-950/40 flex items-center justify-center">
                  {i % 2 === 0 ? (
                    <Gamepad2 className="w-3 h-3 text-indigo-400/60" />
                  ) : (
                    <Coins className="w-3 h-3 text-amber-400/60" />
                  )}
                </div>
              </div>

              {/* Game Title */}
              <div className="h-4 w-28 bg-slate-800 rounded mb-1.5 animate-pulse" />
              <div className="h-2.5 w-16 bg-slate-800/60 rounded animate-pulse" />
            </div>

            {/* Price & Add button */}
            <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between">
              <div className="h-4 w-14 bg-slate-800 rounded animate-pulse" />
              <div className="h-7 w-16 bg-indigo-950/60 border border-indigo-900/50 rounded-lg animate-pulse" />
            </div>
          </div>
        ))}
      </div>

      {/* Catalog loading footer indicator */}
      <div className="flex items-center justify-center gap-3 py-4 text-xs font-mono text-indigo-300">
        <Superballs size={28} speed={1.4} color="#818cf8" />
        <span>CALIBRATING ARCADE CATALOG & LIVE RATES...</span>
      </div>
    </div>
  );
}
