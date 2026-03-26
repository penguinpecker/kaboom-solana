"use client";
import { useState, useEffect } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { VAULT_PDA } from "@/lib/chain";

export function useContracts() {
  const { connection } = useConnection();
  const [vaultBalance, setVaultBalance] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    const fetch = async () => {
      try {
        const bal = await connection.getBalance(VAULT_PDA);
        if (!cancelled) setVaultBalance(bal / LAMPORTS_PER_SOL);
      } catch {}
    };
    fetch();
    const id = setInterval(fetch, 15000);
    return () => { cancelled = true; clearInterval(id); };
  }, [connection]);

  return { vaultBalance };
}

export function useVaultBalance() {
  const { connection } = useConnection();
  const [data, setData] = useState<bigint | undefined>();
  useEffect(() => {
    let c = false;
    const f = async () => { try { const b = await connection.getBalance(VAULT_PDA); if (!c) setData(BigInt(b)); } catch {} };
    f(); const id = setInterval(f, 15000);
    return () => { c = true; clearInterval(id); };
  }, [connection]);
  return { data };
}

export function useVaultHealth() {
  const { connection } = useConnection();
  const [data, setData] = useState<number>(100);
  useEffect(() => {
    let c = false;
    const f = async () => { try { const b = await connection.getBalance(VAULT_PDA); if (!c) setData(b > LAMPORTS_PER_SOL ? 100 : Math.round(b / LAMPORTS_PER_SOL * 100)); } catch {} };
    f(); const id = setInterval(f, 15000);
    return () => { c = true; clearInterval(id); };
  }, [connection]);
  return { data };
}

export function useVaultMaxBet() {
  const { data: balance } = useVaultBalance();
  const maxBet = balance ? BigInt(Math.floor(Number(balance) * 0.02)) : undefined;
  return { data: maxBet };
}

export function useVaultMaxPayout() {
  const { data: balance } = useVaultBalance();
  const maxPayout = balance ? BigInt(Math.floor(Number(balance) * 0.50)) : undefined;
  return { data: maxPayout };
}

export function useGameCounter() { return { data: 0n }; }
export function useRiskLevel() {
  const { data } = useVaultHealth();
  const level = data >= 70 ? 0 : data >= 30 ? 1 : 2;
  return { data: level };
}
export function useWhaleAlertCount() { return { data: 0 }; }

export function useDepositToVault() {
  return { deposit: async (_amt?: string) => { alert("Deposit via CLI: npm run fund-vault -- " + (_amt || "1")); }, isPending: false, isConfirming: false, isSuccess: false };
}

export function useLeaderboard() {
  return { data: [] as { player: string; totalWagered: bigint; totalWon: bigint; gamesPlayed: bigint }[] };
}
