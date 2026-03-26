"use client";
import { useState, useEffect } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL, PublicKey, Transaction, SystemProgram } from "@solana/web3.js";
import { usePrivy } from "@privy-io/react-auth";
import { useWallets, useSignTransaction } from "@privy-io/react-auth/solana";
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
  const { connection } = useConnection();
  const { wallets } = useWallets();
  const { signTransaction } = useSignTransaction();
  const [isPending, setIsPending] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const deposit = async (amt?: string) => {
    const wallet = wallets[0];
    if (!wallet) return;
    try {
      setIsPending(true);
      const sol = parseFloat(amt || "0");
      if (sol <= 0) return;
      const lamports = Math.round(sol * LAMPORTS_PER_SOL);
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: new PublicKey(wallet.address),
          toPubkey: VAULT_PDA,
          lamports,
        })
      );
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      tx.lastValidBlockHeight = lastValidBlockHeight;
      tx.feePayer = new PublicKey(wallet.address);
      setIsConfirming(true);
      const { signedTransaction } = await signTransaction({ transaction: tx.serialize({ requireAllSignatures: false }), wallet: wallet as any });
      const raw = signedTransaction instanceof Uint8Array ? signedTransaction : Buffer.from(signedTransaction);
      await connection.sendRawTransaction(raw);
      setIsSuccess(true);
      setTimeout(() => setIsSuccess(false), 3000);
    } catch (e: any) {
      console.error("Deposit failed:", e.message);
    } finally {
      setIsPending(false);
      setIsConfirming(false);
    }
  };

  return { deposit, isPending, isConfirming, isSuccess };
}

export function useLeaderboard() {
  return { data: [] as { player: string; totalWagered: bigint; totalWon: bigint; gamesPlayed: bigint }[] };
}
