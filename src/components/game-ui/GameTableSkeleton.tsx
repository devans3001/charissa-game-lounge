import React from 'react';
import { Helix } from 'ldrs/react';
import { Terminal, Database } from 'lucide-react';

interface GameTableSkeletonProps {
  rows?: number;
  cols?: number;
  title?: string;
  subtitle?: string;
}

export function GameTableSkeleton({
  rows = 6,
  cols = 5,
  title = 'FETCHING LEDGER TELEMETRY',
  subtitle = 'Querying encrypted live shards from Firestore node...',
}: GameTableSkeletonProps) {
  return (
    <div className="relative bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
      {/* Header telemetry bar */}
      <div className="px-5 py-3.5 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Database className="w-4 h-4 text-indigo-400 animate-pulse" />
          <div>
            <h3 className="font-cyber text-xs tracking-wider uppercase text-slate-200 font-semibold">
              {title}
            </h3>
            <p className="font-mono text-[11px] text-slate-400">{subtitle}</p>
          </div>
        </div>

        {/* LDRS Loader */}
        <div className="flex items-center gap-2 text-indigo-400">
          <Helix size={20} speed={2} color="#818cf8" />
          <span className="font-mono text-[10px] tracking-widest uppercase">SYNCING</span>
        </div>
      </div>

      {/* Table Mockup */}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          {/* Header Row */}
          <thead>
            <tr className="border-b border-slate-800/80 bg-slate-900/80">
              {Array.from({ length: cols }).map((_, i) => (
                <th key={i} className="py-3 px-4">
                  <div className="h-3 bg-slate-800/80 rounded w-20 animate-pulse" />
                </th>
              ))}
            </tr>
          </thead>

          {/* Rows */}
          <tbody className="divide-y divide-slate-800/40">
            {Array.from({ length: rows }).map((_, rIdx) => (
              <tr
                key={rIdx}
                className="hover:bg-slate-800/20 transition-colors animate-scan-sweep"
              >
                {Array.from({ length: cols }).map((_, cIdx) => (
                  <td key={cIdx} className="py-3.5 px-4">
                    <div
                      className="h-3.5 bg-slate-800/70 rounded animate-pulse"
                      style={{
                        width: `${Math.max(45, 85 - (cIdx * 12 + (rIdx % 3) * 10))}%`,
                        opacity: 0.8 - rIdx * 0.08,
                      }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer Status Bar */}
      <div className="px-4 py-2 border-t border-slate-800/60 bg-slate-950/40 flex items-center justify-between text-[11px] font-mono text-slate-400">
        <span className="flex items-center gap-1.5">
          <Terminal className="w-3 h-3 text-emerald-400" />
          READING_STREAM: ACTIVE
        </span>
        <span>AWAITING NEXT SYNC CYCLE</span>
      </div>
    </div>
  );
}
