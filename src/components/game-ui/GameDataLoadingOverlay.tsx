import React from 'react';
import { Quantum } from 'ldrs/react';
import { ShieldCheck, Zap } from 'lucide-react';

interface GameDataLoadingOverlayProps {
  label?: string;
  sublabel?: string;
}

export function GameDataLoadingOverlay({
  label = 'PROCESSING TRANSACTION MATRIX...',
  sublabel = 'Awaiting Firestore write acknowledgement & ledger lock...',
}: GameDataLoadingOverlayProps) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="relative w-full max-w-md bg-slate-900 border-2 border-indigo-500/60 rounded-2xl p-6 shadow-[0_0_40px_rgba(99,102,241,0.35)] text-center overflow-hidden">
        {/* Scanlines & grid */}
        <div className="arcade-scanlines absolute inset-0 opacity-40 pointer-events-none" />

        {/* Cyber HUD Brackets */}
        <div className="absolute top-2 left-2 w-3 h-3 border-t-2 border-l-2 border-indigo-400" />
        <div className="absolute top-2 right-2 w-3 h-3 border-t-2 border-r-2 border-indigo-400" />
        <div className="absolute bottom-2 left-2 w-3 h-3 border-b-2 border-l-2 border-indigo-400" />
        <div className="absolute bottom-2 right-2 w-3 h-3 border-b-2 border-r-2 border-indigo-400" />

        {/* Central LDRS animation */}
        <div className="flex justify-center mb-5">
          <div className="p-4 rounded-2xl bg-indigo-950/50 border border-indigo-500/40 shadow-[0_0_20px_rgba(99,102,241,0.25)]">
            <Quantum size={50} speed={1.75} color="#818cf8" />
          </div>
        </div>

        {/* Title */}
        <h4 className="font-cyber text-sm font-bold tracking-wider uppercase text-white mb-1.5">
          {label}
        </h4>
        <p className="font-mono text-xs text-indigo-300 leading-relaxed mb-4">
          {sublabel}
        </p>

        {/* Mini progress indicator */}
        <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden border border-slate-800">
          <div className="bg-gradient-to-r from-indigo-500 via-cyan-400 to-indigo-500 h-full w-full animate-pulse" />
        </div>

        <div className="mt-3 flex items-center justify-between text-[10px] font-mono text-slate-400">
          <span className="flex items-center gap-1 text-emerald-400">
            <ShieldCheck className="w-3 h-3" />
            LEDGER_WRITE: ATOMIC
          </span>
          <span className="flex items-center gap-1 text-amber-400">
            <Zap className="w-3 h-3" />
            DO NOT CLOSE
          </span>
        </div>
      </div>
    </div>
  );
}
