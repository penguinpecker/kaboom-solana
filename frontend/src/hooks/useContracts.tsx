"use client";
import { useState, useEffect } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

const VAULT_PDA_STR = "5AE1Ge893UhJCUxPZj4dAP4VMR2hGQBP9fHL6TiZpxAw";

export function useContracts() {
  const { connection } = useConnection();
  const [vaultBalance, setVaultBalance] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    const fetchBalance = async () => {
      try {
        const { PublicKey } = await import("@solana/web3.js");
        const balance = await connection.getBalance(new PublicKey(VAULT_PDA_STR));
        if (!cancelled) setVaultBalance(balance / LAMPORTS_PER_SOL);
      } catch {}
    };
    fetchBalance();
    const id = setInterval(fetchBalance, 15000);
    return () => { cancelled = true; clearInterval(id); };
  }, [connection]);

  return { vaultBalance };
}

export function useVaultBalance() { return { data: 0n }; }
export function useVaultHealth() { return { data: 100 }; }
export function useVaultMaxBet() { return { data: 0n }; }
export function useVaultMaxPayout() { return { data: 0n }; }
export function useGameCounter() { return { data: 0n }; }
export function useRiskLevel() { return { data: "LOW" }; }
export function useWhaleAlertCount() { return { data: 0 }; }
export function useDepositToVault() { return { deposit: async (_amt?: string) => {}, isPending: false, isConfirming: false, isSuccess: false }; }
export function useLeaderboard() {
  return { data: [] as { player: string; totalWagered: bigint; totalWon: bigint; gamesPlayed: bigint }[] };
}
