"use client";
import { formatEther, useAccount, useBalance } from "@/lib/compat";
import Link from "next/link";
import { useVaultBalance, useVaultHealth, useGameCounter, useWhaleAlertCount } from "@/hooks/useContracts";
import { useGameHistory } from "@/hooks/useGameHistory";

import { useMemo } from "react";

const EXPLORER = "https://solscan.io";

export default function HomePage() {
  return (
    <>
      <HeroSection />
      <StatsBanner />
      <HowItWorks />
      <ReactiveModules />
      <RealTimeIntel />
      <SolanaFooter />
    </>
  );
}

function HeroSection() {
  return (
    <section className="relative min-h-[870px] flex items-center justify-center overflow-hidden kinetic-grid">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-secondary/5 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute top-1/4 right-10 w-[400px] h-[400px] bg-primary/10 blur-[100px] rounded-full pointer-events-none" />
      <div className="container mx-auto px-6 relative z-10 flex flex-col items-center text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1 bg-surface-container-high rounded-full mb-8 border border-outline-variant/15">
          <span className="status-dot" />
          <span className="font-headline text-[10px] uppercase tracking-[0.2em] text-on-surface-variant">System Online // Solana Mainnet mainnet</span>
        </div>
        <h1 className="font-headline text-6xl md:text-8xl font-black italic tracking-tighter text-on-surface mb-6 leading-none">
          DOMINATE <span className="text-primary">THE GRID</span>
        </h1>
        <p className="font-body text-lg text-on-surface-variant max-w-2xl mb-12">
          On-chain mines on a 4×4 grid. Provably fair. 6 reactive smart contracts. Embedded wallet auto-sign. Built on Solana.
        </p>
        <div className="relative mb-16 p-4 bg-surface-container-lowest/50 backdrop-blur-md rounded-xl border border-outline-variant/10">
          <div className="grid grid-cols-4 gap-3 w-64 md:w-80 h-64 md:h-80">
            {Array.from({ length: 16 }).map((_, i) => {
              if (i === 2) return <div key={i} className="bg-primary/20 border border-primary shadow-[inset_0_0_20px_rgba(164,201,255,0.2)] flex items-center justify-center"><span className="material-symbols-outlined text-primary" style={{ fontSize: 24 }}>bolt</span></div>;
              if (i === 5) return <div key={i} className="bg-tertiary/10 border border-tertiary/30 flex items-center justify-center"><span className="material-symbols-outlined text-tertiary" style={{ fontSize: 24 }}>dangerous</span></div>;
              if (i === 11) return <div key={i} className="bg-primary/20 border border-primary shadow-[inset_0_0_20px_rgba(164,201,255,0.2)]" />;
              return <div key={i} className="bg-surface-container-high border border-primary/20 hover:border-primary transition-all" />;
            })}
          </div>
        </div>
        <Link href="/play" className="group relative px-12 py-5 font-headline text-2xl font-black italic tracking-tighter text-on-primary bg-gradient-to-br from-primary to-primary-container transition-all hover:scale-105 active:scale-95">
          <span className="relative z-10">ENGAGE NOW</span>
          <div className="absolute inset-0 bg-primary blur-xl opacity-0 group-hover:opacity-30 transition-opacity" />
        </Link>
      </div>
    </section>
  );
}

function StatsBanner() {
  const { data: vaultBal } = useVaultBalance();
  const { data: vaultHealth } = useVaultHealth();
  const { data: gameCount } = useGameCounter();

  return (
    <section className="bg-surface-container-low border-y border-outline-variant/10 py-6">
      <div className="container mx-auto px-12 flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-4">
          <span className="font-headline text-[10px] uppercase tracking-widest text-on-surface-variant">On-Chain Stats</span>
          <div className="h-px w-12 bg-outline-variant/30" />
        </div>
        <div className="flex gap-12">
          <div className="flex flex-col">
            <span className="font-headline text-[10px] text-on-surface-variant uppercase tracking-widest">Vault Balance</span>
            <span className="font-headline text-2xl font-bold text-primary">{vaultBal ? Number(formatEther(vaultBal)).toFixed(2) : "—"} SOL</span>
          </div>
          <div className="flex flex-col">
            <span className="font-headline text-[10px] text-on-surface-variant uppercase tracking-widest">Vault Health</span>
            <span className="font-headline text-2xl font-bold text-emerald">{vaultHealth ? vaultHealth.toString() : "—"}%</span>
          </div>
          <div className="flex flex-col">
            <span className="font-headline text-[10px] text-on-surface-variant uppercase tracking-widest">Total Games</span>
            <span className="font-headline text-2xl font-bold text-secondary">{gameCount ? gameCount.toString() : "0"}</span>
          </div>
          <div className="flex flex-col">
            <span className="font-headline text-[10px] text-on-surface-variant uppercase tracking-widest">Reactive Subs</span>
            <span className="font-headline text-2xl font-bold text-tertiary">5 Live</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section className="py-24 container mx-auto px-12">
      <h2 className="font-headline text-4xl font-black italic tracking-tight text-on-surface mb-16 border-l-4 border-primary pl-6">HOW IT WORKS</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="bg-surface-container p-8 rounded-lg relative overflow-hidden group hover:bg-surface-container-high transition-all">
          <span className="absolute -top-4 -right-4 text-8xl font-black text-on-surface/5 italic font-headline">01</span>
          <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-6 border border-primary/20"><span className="material-symbols-outlined text-primary">payments</span></div>
          <h3 className="font-headline text-xl font-bold text-on-surface mb-4">SET YOUR STAKE</h3>
          <p className="font-body text-sm text-on-surface-variant mb-6 leading-relaxed">Choose bet amount + mine density. Higher mines = higher multiplier. 2% house edge, provably fair via keccak256.</p>
          <div className="p-4 bg-surface-container-lowest rounded border border-outline-variant/10">
            <div className="flex justify-between items-center mb-2"><span className="font-headline text-[10px] text-on-surface-variant uppercase">Bet Amount</span><span className="font-headline text-[10px] text-primary">MAX STAKE</span></div>
            <div className="flex items-center gap-2"><div className="flex-grow h-1 bg-surface-container-highest overflow-hidden"><div className="h-full bg-primary w-[40%]" /></div><span className="font-headline text-sm font-bold">0.10 SOL</span></div>
          </div>
        </div>
        <div className="bg-surface-container p-8 rounded-lg relative overflow-hidden group hover:bg-surface-container-high transition-all">
          <span className="absolute -top-4 -right-4 text-8xl font-black text-on-surface/5 italic font-headline">02</span>
          <div className="w-12 h-12 bg-secondary/10 rounded-lg flex items-center justify-center mb-6 border border-secondary/20"><span className="material-symbols-outlined text-secondary">grid_view</span></div>
          <h3 className="font-headline text-xl font-bold text-on-surface mb-4">REVEAL TILES</h3>
          <p className="font-body text-sm text-on-surface-variant mb-6 leading-relaxed">Click tiles on the 4×4 grid. Each safe tile increases your multiplier. Hit a mine and you lose your bet.</p>
          <div className="grid grid-cols-4 gap-1 p-2 bg-surface-container-lowest rounded border border-outline-variant/10 w-32 mx-auto">
            {[1,0,0,2,0,1,0,0,0,0,1,0,0,0,0,0].map((t, i) => (
              <div key={i} className={`aspect-square ${t === 1 ? "bg-primary/40" : t === 2 ? "bg-tertiary/40" : "bg-surface-container-highest"}`} />
            ))}
          </div>
        </div>
        <div className="bg-surface-container p-8 rounded-lg relative overflow-hidden group hover:bg-surface-container-high transition-all">
          <span className="absolute -top-4 -right-4 text-8xl font-black text-on-surface/5 italic font-headline">03</span>
          <div className="w-12 h-12 bg-tertiary/10 rounded-lg flex items-center justify-center mb-6 border border-tertiary/20"><span className="material-symbols-outlined text-tertiary">trending_up</span></div>
          <h3 className="font-headline text-xl font-bold text-on-surface mb-4">CASH OUT OR CLIMB</h3>
          <p className="font-body text-sm text-on-surface-variant mb-6 leading-relaxed">Cash out anytime to lock your multiplier. Or push deeper for exponential gains. Payout from vault, auto-signed via Privy.</p>
          <div className="flex items-end gap-1 h-12 justify-center">
            <div className="w-3 bg-tertiary/20 h-1/4" /><div className="w-3 bg-tertiary/40 h-2/4" /><div className="w-3 bg-tertiary/60 h-3/4" />
            <div className="w-3 bg-tertiary h-full relative"><span className="font-headline text-[10px] font-black absolute -top-5 -left-2">12.5×</span></div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ReactiveModules() {
  const modules = [
    { title: "RISK GUARDIAN", badge: "LIVE", badgeColor: "bg-emerald/20 text-emerald", desc: "Monitors vault health + game outcomes. Auto-pauses if reserves drop below threshold.", subs: ["GameSettled → RiskGuardian", "VaultChanged → RiskGuardian"], gradient: "from-primary/5 via-surface-container to-emerald/5" },
    { title: "LEADERBOARD", badge: "LIVE", badgeColor: "bg-secondary/20 text-secondary", desc: "Auto-ranks players by biggest win. Updates reactively on every GameWon event. Fully on-chain.", subs: ["GameWon → ReactiveLeaderboard"], gradient: "from-secondary/5 via-surface-container to-primary/5" },
    { title: "WHALE ALERT", badge: "LIVE", badgeColor: "bg-amber/20 text-amber", desc: "Detects large bets in real-time. Tracks referral activity. 2 subscriptions monitoring BetPlaced events.", subs: ["BetPlaced → WhaleAlert", "BetPlaced → Referral"], gradient: "from-tertiary/5 via-surface-container to-amber/5" },
  ];

  return (
    <section className="py-24 bg-surface-container-lowest">
      <div className="container mx-auto px-12">
        <div className="flex justify-between items-end mb-16">
          <div><h2 className="font-headline text-4xl font-black italic tracking-tight text-on-surface mb-2">REACTIVE MODULES</h2><p className="font-body text-on-surface-variant">5 autonomous on-chain subscriptions</p></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {modules.map(m => (
            <div key={m.title} className="group relative overflow-hidden rounded-xl h-80 bg-surface-container-high hover:translate-y-[-4px] transition-transform duration-300">
              <div className={`absolute inset-0 bg-gradient-to-br ${m.gradient}`} />
              <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/40 to-transparent" />
              <div className="absolute bottom-0 p-8 w-full">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-headline text-2xl font-black italic text-on-surface">{m.title}</h3>
                  <span className={`${m.badgeColor} font-headline text-[10px] px-2 py-0.5 rounded uppercase`}>{m.badge}</span>
                </div>
                <p className="font-body text-xs text-on-surface-variant mb-4">{m.desc}</p>
                <div className="flex flex-wrap gap-2">
                  {m.subs.map(s => <span key={s} className="px-2 py-0.5 bg-surface-container-highest font-headline text-[9px] text-on-surface-variant">{s}</span>)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function RealTimeIntel() {
  const { history } = useGameHistory();
  const { data: gameCount } = useGameCounter();
  const { data: vaultBal } = useVaultBalance();
  const recent = history.slice(0, 4);

  return (
    <section className="py-24 container mx-auto px-12">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-12 items-start">
        <div className="lg:col-span-1">
          <h2 className="font-headline text-4xl font-black italic tracking-tight text-on-surface mb-6">REAL-TIME INTEL</h2>
          <p className="font-body text-sm text-on-surface-variant mb-8 leading-relaxed">Live game data from localStorage cache + on-chain contract reads.</p>
          <div className="space-y-4">
            <div className="flex items-center gap-3"><span className="status-dot" /><span className="font-headline text-[10px] uppercase tracking-widest text-on-surface">{gameCount ? gameCount.toString() : history.length} Games Played</span></div>
            <div className="flex items-center gap-3"><span className="w-1.5 h-1.5 rounded-full bg-primary status-dot" /><span className="font-headline text-[10px] uppercase tracking-widest text-on-surface">{vaultBal ? Number(formatEther(vaultBal)).toFixed(2) : "—"} SOL in Vault</span></div>
            <div className="flex items-center gap-3"><span className="w-1.5 h-1.5 rounded-full bg-tertiary status-dot" /><span className="font-headline text-[10px] uppercase tracking-widest text-on-surface">6 Contracts Verified</span></div>
          </div>
        </div>
        <div className="lg:col-span-3">
          <div className="bg-surface-container-low rounded-lg border border-outline-variant/10 overflow-hidden">
            <div className="grid grid-cols-4 px-6 py-4 bg-surface-container-high font-headline text-[10px] uppercase tracking-widest text-on-surface-variant"><span>Operative</span><span>Module</span><span>Multiplier</span><span className="text-right">Result</span></div>
            <div className="divide-y divide-outline-variant/5">
              {recent.length > 0 ? recent.map((g, i) => (
                <div key={`${g.gameId}-${g.timestamp}`} className="grid grid-cols-4 px-6 py-4 items-center hover:bg-surface-container-highest transition-colors">
                  <div className="flex items-center gap-2">
                    <div className={`w-6 h-6 rounded ${g.won ? "bg-primary/20" : "bg-error/20"} flex items-center justify-center font-headline text-[8px] font-bold ${g.won ? "text-primary" : "text-error"}`}>{g.player.slice(2, 4).toUpperCase()}</div>
                    <span className="font-body text-sm text-on-surface">{g.player.slice(0, 6)}…{g.player.slice(-4)}</span>
                  </div>
                  <span className="font-headline text-xs text-on-surface-variant">MINES (4×4)</span>
                  <span className={`font-headline text-sm font-bold ${g.won ? "text-primary" : "text-on-surface-variant"}`}>×{g.won ? g.multiplier.toFixed(2) : "0.00"}</span>
                  <span className={`font-headline text-sm font-bold ${g.won ? "text-primary" : "text-error"} text-right`}>{g.won ? "+" : "-"}{(g.won ? g.payout : g.bet).toFixed(3)} SOL</span>
                </div>
              )) : (
                <div className="px-6 py-8 text-center text-on-surface-variant text-sm">Play a game to see live intel here</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function SolanaFooter() {
  return (
    <footer className="w-full flex flex-col md:flex-row justify-between items-center px-12 py-8 gap-4 bg-surface-container-lowest border-t border-outline-variant/15">
      <span className="font-headline text-[10px] uppercase tracking-widest text-on-surface-variant">© 2026 KABOOM! Kinetic Engine. All Systems Operational. Solana Mainnet.</span>
      <div className="flex gap-8">
        <a className="font-headline text-[10px] uppercase tracking-widest text-on-surface-variant hover:text-tertiary transition-colors" href={EXPLORER} target="_blank" rel="noreferrer">Explorer</a>
        <a className="font-headline text-[10px] uppercase tracking-widest text-on-surface-variant hover:text-tertiary transition-colors" href="https://github.com/penguinpecker/kaboom-game" target="_blank" rel="noreferrer">GitHub</a>
        <a className="font-headline text-[10px] uppercase tracking-widest text-on-surface-variant hover:text-tertiary transition-colors" href="https://dorahacks.io/hackathon/solana-reactivity" target="_blank" rel="noreferrer">DoraHacks</a>
      </div>
    </footer>
  );
}
