"use client";
import Link from "next/link";
import { KaboomLogo } from "@/components/ui/KaboomLogo";
import { usePrivy } from "@privy-io/react-auth";
import { useWallets, useCreateWallet } from "@privy-io/react-auth/solana";
import { useConnection } from "@solana/wallet-adapter-react";
import { useVaultBalance, useVaultHealth, useRiskLevel, useWhaleAlertCount } from "@/hooks/useContracts";
import { useModal } from "@/hooks/useModal";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useState, useEffect } from "react";

export default function Navbar() {
  const { authenticated, login, logout, user } = usePrivy();
  const { wallets } = useWallets();
  const wallet = wallets[0];
  const { connection } = useConnection();
  const { data: riskLevel } = useRiskLevel();
  const { data: whaleCount } = useWhaleAlertCount();
  const [balance, setBalance] = useState<number>(0);

  useEffect(() => {
    if (!wallet?.address) return;
    let cancelled = false;
    (async () => {
      try {
        const { PublicKey } = await import("@solana/web3.js");
        const bal = await connection.getBalance(new PublicKey(wallet.address));
        if (!cancelled) setBalance(bal / LAMPORTS_PER_SOL);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [wallet?.address, connection]);

  const shortAddr = wallet?.address
    ? wallet.address.slice(0, 4) + "..." + wallet.address.slice(-4)
    : "";

  return (
    <nav className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <KaboomLogo size={32} />
          <span className="text-lg font-bold text-white">KABOOM!</span>
        </Link>

        <div className="hidden md:flex items-center gap-6">
          <Link href="/play" className="text-sm text-zinc-400 hover:text-white transition-colors">Play</Link>
          <Link href="/vault" className="text-sm text-zinc-400 hover:text-white transition-colors">Vault</Link>
          <Link href="/leaderboard" className="text-sm text-zinc-400 hover:text-white transition-colors">Leaderboard</Link>
          <Link href="/logs" className="text-sm text-zinc-400 hover:text-white transition-colors">Logs</Link>
        </div>

        <div className="flex items-center gap-3">
          {authenticated && wallet ? (
            <>
              <span className="text-sm text-zinc-400">{balance.toFixed(3)} SOL</span>
              <button
                onClick={() => logout()}
                className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm text-white hover:bg-zinc-700 transition-colors"
              >
                {shortAddr}
              </button>
            </>
          ) : (
            <button
              onClick={() => login()}
              className="rounded-lg bg-orange-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-orange-500 transition-colors"
            >
              Connect
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
