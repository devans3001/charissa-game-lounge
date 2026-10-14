import React, { useState, useEffect } from 'react';
import { Quantum } from 'ldrs/react';
import { Gamepad2, Coins, Sparkles, Volume2, VolumeX, ShieldCheck, Zap, Terminal } from 'lucide-react';
import { arcadeAudio } from '../../lib/arcadeAudio.ts';

const BOOT_STEPS = [
  { text: 'VERIFYING LAGOS CLOUD RUN & FIRESTORE SHARDS...', progress: 18 },
  { text: 'INITIALIZING DUAL-SENSE ANALOGS & ARCADE BUTTON MATRIX...', progress: 38 },
  { text: 'CALIBRATING PHYSICAL TOKEN HOPPERS & VAULT TELEMETRY...', progress: 58 },
  { text: 'LOADING NGN CURRENCY PROTOCOLS & LAGOS TIMEZONE CLOCK...', progress: 78 },
  { text: 'MOUNTING FINANCIAL LEDGERS & SHIFT AUDIT TRAIL...', progress: 92 },
  { text: 'ALL SYSTEMS NOMINAL. READY PLAYER ONE.', progress: 100 },
];

const GAMER_TIPS = [
  'PRO TIP: Open Customer Tabs let players game continuously and settle in a single payment.',
  'PRO TIP: PS5 Station rates can be set by fixed session blocks (15m, 30m, 1hr, 2hr).',
  'PRO TIP: Physical game tokens in the vault reconcile directly against cashier cash at shift close.',
  'PRO TIP: Cashiers can use "Flag Fix" on any disputed receipt for fast Admin correction.',
  'PRO TIP: Check the live daily reconciliation dashboard before signing off cashier shifts.',
];

interface GameBootLoadingScreenProps {
  onComplete?: () => void;
  minDurationMs?: number;
}

export function GameBootLoadingScreen({ onComplete, minDurationMs = 1800 }: GameBootLoadingScreenProps) {
  const [stepIdx, setStepIdx] = useState(0);
  const [progress, setProgress] = useState(15);
  const [tipIdx, setTipIdx] = useState(0);
  const [sfxEnabled, setSfxEnabled] = useState(arcadeAudio.isEnabled());
  const [logs, setLogs] = useState<string[]>([
    '> SYSTEM BIOS v2.6.4 (LAGOS ARCHITECTURE)',
    '> DETECTING 4K SHIELD MONITORS...',
  ]);

  // Rotate tips
  useEffect(() => {
    const tipInterval = setInterval(() => {
      setTipIdx((prev) => (prev + 1) % GAMER_TIPS.length);
    }, 3800);
    return () => clearInterval(tipInterval);
  }, []);

  // Step through boot sequence
  useEffect(() => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      setStepIdx((prev) => {
        const next = prev + 1;
        if (next < BOOT_STEPS.length) {
          setProgress(BOOT_STEPS[next].progress);
          setLogs((l) => [...l.slice(-4), `> ${BOOT_STEPS[next].text}`]);
          arcadeAudio.playBlip();
          return next;
        }
        clearInterval(interval);
        setProgress(100);
        arcadeAudio.playBoot();
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, minDurationMs - elapsed);
        setTimeout(() => {
          if (onComplete) onComplete();
        }, remaining);
        return prev;
      });
    }, minDurationMs / BOOT_STEPS.length);

    return () => clearInterval(interval);
  }, [minDurationMs, onComplete]);

  const toggleSfx = () => {
    const next = arcadeAudio.toggle();
    setSfxEnabled(next);
  };

  // 16-segment retro energy bar
  const totalSegments = 16;
  const activeSegments = Math.round((progress / 100) * totalSegments);

  return (
    <div className="relative min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-between p-4 sm:p-8 select-none overflow-hidden arcade-grid">
      {/* CRT Scanline Overlay */}
      <div className="arcade-scanlines fixed inset-0 z-10 opacity-70 pointer-events-none" />

      {/* Vignette glow */}
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-950/20 via-slate-950/80 to-slate-950 z-0" />

      {/* TOP RETRO HUD HEADER */}
      <header className="relative z-20 w-full max-w-4xl flex items-center justify-between border-b border-indigo-900/60 pb-3 font-cyber text-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-950/80 border border-emerald-800 text-emerald-400 rounded">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
            <span className="font-mono text-[10px] tracking-wider uppercase">CORE 01 // ONLINE</span>
          </div>
          <span className="hidden sm:inline text-slate-400 font-mono text-[11px]">
            LAGOS REVENUE OS · ARCADE EDITION
          </span>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-3 text-slate-400 font-mono text-[11px]">
            <span>FPS: 60</span>
            <span>·</span>
            <span>SHARDS: 5/5</span>
            <span>·</span>
            <span>PING: 18ms</span>
          </div>

          <button
            type="button"
            onClick={toggleSfx}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-900 hover:bg-slate-800 border border-indigo-900/80 text-indigo-300 rounded text-[11px] font-mono cursor-pointer transition"
            title="Toggle Retro Arcade Sound Effects"
          >
            {sfxEnabled ? <Volume2 className="w-3.5 h-3.5 text-emerald-400" /> : <VolumeX className="w-3.5 h-3.5 text-slate-400" />}
            <span>SFX {sfxEnabled ? 'ON' : 'OFF'}</span>
          </button>
        </div>
      </header>

      {/* CENTRAL ARCADE LOADING MATRIX */}
      <main className="relative z-20 my-auto w-full max-w-xl flex flex-col items-center text-center px-4 py-8">
        {/* Glowing Holographic Arcade Crest */}
        <div className="relative mb-8">
          <div className="absolute -inset-4 bg-indigo-500/20 rounded-full blur-xl animate-pulse" />
          <div className="relative w-28 h-28 rounded-2xl bg-gradient-to-br from-indigo-900/80 via-slate-900 to-indigo-950 border-2 border-indigo-500/60 shadow-[0_0_30px_rgba(99,102,241,0.4)] flex items-center justify-center">
            {/* Center LDRS loader */}
            <div className="absolute inset-0 flex items-center justify-center">
              <Quantum size={72} speed={1.75} color="#818cf8" />
            </div>
            {/* Center icon */}
            <Gamepad2 className="w-9 h-9 text-indigo-300 drop-shadow-[0_0_10px_rgba(129,140,248,0.8)] z-10" />
            {/* Corner cyber ticks */}
            <div className="absolute top-1 left-1 w-2 h-2 border-t-2 border-l-2 border-indigo-400" />
            <div className="absolute top-1 right-1 w-2 h-2 border-t-2 border-r-2 border-indigo-400" />
            <div className="absolute bottom-1 left-1 w-2 h-2 border-b-2 border-l-2 border-indigo-400" />
            <div className="absolute bottom-1 right-1 w-2 h-2 border-b-2 border-r-2 border-indigo-400" />
          </div>
        </div>

        {/* Title */}
        <h1 className="font-arcade text-lg sm:text-xl text-white tracking-wider mb-2 drop-shadow-[0_0_12px_rgba(99,102,241,0.6)]">
          GAME LOUNGE OS
        </h1>
        <p className="font-cyber text-xs tracking-widest text-indigo-300 uppercase mb-6">
          INITIALIZING REVENUE & TOKEN ENGINE
        </p>

        {/* RETRO 16-SEGMENT ARCADE PROGRESS BAR */}
        <div className="w-full bg-slate-950/90 border-2 border-indigo-900/80 rounded-xl p-3 shadow-[0_0_20px_rgba(79,70,229,0.25)] mb-6">
          <div className="flex items-center justify-between text-xs font-mono mb-2">
            <span className="text-slate-400 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-400 animate-bounce" />
              SYSTEM CHARGE
            </span>
            <span className="text-emerald-400 font-bold tracking-widest">
              [ {progress}% ]
            </span>
          </div>

          {/* Segmented LED Cells */}
          <div className="grid grid-cols-16 gap-1.5 h-4 p-1 bg-slate-900 border border-slate-800 rounded">
            {Array.from({ length: totalSegments }).map((_, i) => {
              const isFilled = i < activeSegments;
              return (
                <div
                  key={i}
                  className={`h-full rounded-xs transition-all duration-300 ${
                    isFilled
                      ? i < 11
                        ? 'bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)]'
                        : i < 14
                        ? 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]'
                        : 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                      : 'bg-slate-800/50'
                  }`}
                />
              );
            })}
          </div>

          {/* Current Step Label */}
          <div className="mt-3 text-left">
            <div className="font-mono text-[11px] text-indigo-300 truncate flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-ping" />
              {BOOT_STEPS[stepIdx]?.text || 'INITIALIZING COMPONENT MATRIX...'}
            </div>
          </div>
        </div>

        {/* RETRO TERMINAL LOG STREAM */}
        <div className="w-full bg-slate-950/90 border border-slate-800/80 rounded-lg p-3 font-mono text-[11px] text-left text-slate-400 space-y-1 mb-6 shadow-inner">
          <div className="flex items-center gap-1.5 text-slate-400 text-[10px] pb-1 border-b border-slate-800 mb-1.5">
            <Terminal className="w-3 h-3 text-indigo-400" />
            <span>CONSOLE STREAM (TTY0)</span>
          </div>
          {logs.map((log, index) => (
            <div
              key={index}
              className={`truncate ${index === logs.length - 1 ? 'text-emerald-300 font-semibold' : 'text-slate-400'}`}
            >
              {log}
            </div>
          ))}
        </div>

        {/* GAMER PRO-TIP CAROUSEL */}
        <div className="w-full bg-indigo-950/30 border border-indigo-900/50 rounded-lg p-3 text-left flex items-start gap-3">
          <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5 animate-pulse" />
          <div className="flex-1">
            <div className="text-[10px] font-mono text-indigo-300 uppercase tracking-wider font-semibold">
              GAMER TELEMETRY & OPERATION TIP
            </div>
            <p className="text-xs text-slate-300 mt-0.5 leading-relaxed font-sans">
              {GAMER_TIPS[tipIdx]}
            </p>
          </div>
        </div>
      </main>

      {/* BOTTOM RETRO ARCADE FOOTER */}
      <footer className="relative z-20 w-full max-w-4xl flex flex-col sm:flex-row items-center justify-between gap-2 border-t border-indigo-900/60 pt-3 font-cyber text-xs text-slate-400">
        <div className="flex items-center gap-2 font-mono text-[11px]">
          <Coins className="w-3.5 h-3.5 text-amber-400" />
          <span>CREDITS: 99</span>
          <span className="text-slate-400">·</span>
          <span className="text-emerald-400">INSERT COIN [FREEPLAY]</span>
        </div>

        <div className="font-arcade text-[10px] text-indigo-400 animate-pulse tracking-widest">
          {progress >= 100 ? 'PRESS START TO ENTER' : 'LOADING DATA SHARDS...'}
        </div>

        <div className="flex items-center gap-1.5 text-[11px] font-mono">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>LAGOS SECURITY SHIELD OK</span>
        </div>
      </footer>
    </div>
  );
}
