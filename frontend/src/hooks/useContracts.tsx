"use client";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useCallback, useEffect, useState } from "react";
import { useProgram } from "@/hooks/useProgram";
import { VAULT_PDA, GAME_CONFIG, getPlayerStatsPda, PROGRAM_ID } from "@/lib/chain";
import * as anchor from "@coral-xyz/anchor";

// ═══════════════════════════════════════════════
// VAULT HOOKS
// ═══════════════════════════════════════════════

export function useVaultBalance() {
  const { connection } = useConnection();
  const [data, setData] = useState<bigint | undefined>();

  useEffect(() => {
    let cancelled = false;
    const fetch = async () => {
      try {
        const balance = await connection.getBalance(VAULT_PDA);
        if (!cancelled) setData(BigInt(balance));
      } catch {}
    };
    fetch();
    const i = setInterval(fetch, 10_000);
    return () => { cancelled = true; clearInterval(i); };
  }, [connection]);

  return { data };
}

export function useVaultData() {
  const program = useProgram();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!program) return;
    let cancelled = false;
    const fetch = async () => {
      try {
        const vault = await program.account.vault.fetch(VAULT_PDA);
        if (!cancelled) setData(vault);
      } catch {}
    };
    fetch();
    const i = setInterval(fetch, 15_000);
    return () => { cancelled = true; clearInterval(i); };
  }, [program]);

  return { data };
}

export function useVaultHealth() {
  const { data: balance } = useVaultBalance();
  const { data: vaultData } = useVaultData();
  const [data, setData] = useState<number | undefined>();

  useEffect(() => {
    if (balance === undefined) return;
    const balSol = Number(balance) / LAMPORTS_PER_SOL;
    // Health based on vault balance relative to total wagered
    if (vaultData) {
      const wagered = (vaultData.totalWagered as anchor.BN).toNumber() / LAMPORTS_PER_SOL;
      const payouts = (vaultData.totalPayouts as anchor.BN).toNumber() / LAMPORTS_PER_SOL;
      const profit = wagered - payouts;
      // If vault is growing (profit > 0), health is high
      const health = Math.min(100, Math.max(0, Math.round(50 + (profit / Math.max(1, balSol)) * 50)));
      setData(health);
    } else {
      // Fallback: estimate from balance alone
      setData(Math.min(100, Math.round(balSol * 10)));
    }
  }, [balance, vaultData]);

  return { data };
}

export function useVaultMaxBet() {
  const { data: balance } = useVaultBalance();
  const [data, setData] = useState<bigint | undefined>();

  useEffect(() => {
    if (balance !== undefined) {
      // Max bet = 2% of vault
      setData(balance * BigInt(200) / BigInt(10_000));
    }
  }, [balance]);

  return { data };
}

export function useVaultMaxPayout() {
  const { data: balance } = useVaultBalance();
  const [data, setData] = useState<bigint | undefined>();

  useEffect(() => {
    if (balance !== undefined) {
      setData(balance * BigInt(1_000) / BigInt(10_000));
    }
  }, [balance]);

  return { data };
}

export function useRiskLevel() {
  const { data: health } = useVaultHealth();
  const [data, setData] = useState<number | undefined>();

  useEffect(() => {
    if (health !== undefined) {
      if (health >= 60) setData(0);
      else if (health >= 30) setData(1);
      else setData(2);
    }
  }, [health]);

  return { data };
}

export function useDepositToVault() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const program = useProgram();
  const [isPending, setIsPending] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const deposit = useCallback(async (amountSol: string) => {
    if (!wallet.publicKey || !program) return;
    setIsPending(true);
    setIsSuccess(false);

    try {
      const amount = new anchor.BN(Math.floor(parseFloat(amountSol) * LAMPORTS_PER_SOL));
      setIsConfirming(true);

      await program.methods
        .fundVault(amount)
        .accounts({
          vault: VAULT_PDA,
          funder: wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc({ commitment: "confirmed" });

      setIsSuccess(true);
    } catch (err) {
      console.error("Deposit failed:", err);
    } finally {
      setIsPending(false);
      setIsConfirming(false);
    }
  }, [wallet, program]);

  return { deposit, isPending, isConfirming, isSuccess };
}

// ═══════════════════════════════════════════════
// GAME COUNTER — read from vault account
// ═══════════════════════════════════════════════

export function useGameCounter() {
  const { data: vaultData } = useVaultData();
  const [data, setData] = useState<number | undefined>();

  useEffect(() => {
    if (vaultData) {
      setData((vaultData.totalGames as anchor.BN).toNumber());
    }
  }, [vaultData]);

  return { data };
}

// ═══════════════════════════════════════════════
// LEADERBOARD — fetch all PlayerStats accounts via getProgramAccounts
// ═══════════════════════════════════════════════

export function useLeaderboard() {
  const { connection } = useConnection();
  const program = useProgram();
  const [data, setData] = useState<any[] | undefined>();

  useEffect(() => {
    if (!program) return;
    let cancelled = false;

    const fetch = async () => {
      try {
        // Fetch all PlayerStats accounts
        const accounts = await program.account.playerStats.all();

        const leaders = accounts
          .map((a: any) => ({
            player: a.account.player.toBase58(),
            biggestWin: a.account.biggestWin,
            biggestMultiplier: a.account.highestMultiplierBps,
            gamesPlayed: (a.account.gamesPlayed as anchor.BN).toNumber(),
            gamesWon: (a.account.gamesWon as anchor.BN).toNumber(),
            totalWinnings: a.account.totalWinnings,
          }))
          .filter((p: any) => (p.biggestWin as anchor.BN).toNumber() > 0)
          .sort((a: any, b: any) =>
            (b.totalWinnings as anchor.BN).toNumber() - (a.totalWinnings as anchor.BN).toNumber()
          )
          .slice(0, 20);

        if (!cancelled) setData(leaders);
      } catch (err) {
        console.error("Leaderboard fetch error:", err);
      }
    };

    fetch();
    const i = setInterval(fetch, 30_000);
    return () => { cancelled = true; clearInterval(i); };
  }, [program, connection]);

  return { data };
}

export function usePlayerStats(address: string | undefined) {
  const program = useProgram();
  const [data, setData] = useState<any>(undefined);

  useEffect(() => {
    if (!program || !address) return;
    let cancelled = false;

    const fetch = async () => {
      try {
        const pubkey = new anchor.web3.PublicKey(address);
        const [pda] = getPlayerStatsPda(pubkey);
        const stats = await program.account.playerStats.fetch(pda);
        if (!cancelled) setData(stats);
      } catch {}
    };

    fetch();
    return () => { cancelled = true; };
  }, [program, address]);

  return { data };
}

// ═══════════════════════════════════════════════
// REFERRAL — not yet implemented on Solana
// ═══════════════════════════════════════════════

export function useReferralStats(address: string | undefined) {
  return { data: undefined };
}

export function useClaimReferralRewards() {
  return { claim: () => {}, isPending: false, isConfirming: false, isSuccess: false, error: null };
}

// ═══════════════════════════════════════════════
// WHALE ALERTS — not yet implemented
// ═══════════════════════════════════════════════

export function useWhaleAlerts(count: number = 5) {
  return { data: undefined };
}

export function useWhaleAlertCount() {
  return { data: undefined };
}

// ═══════════════════════════════════════════════
// VERIFY GAME
// ═══════════════════════════════════════════════

export function useVerifyGame(gameId: bigint | undefined) {
  // On Solana, mine positions are stored in the Game PDA
  // After game ends, anyone can read the mineMask
  return { data: undefined };
}

// ═══════════════════════════════════════════════
// UTILITY
// ═══════════════════════════════════════════════

export function formatSTTFromWei(wei: bigint | undefined): string {
  if (!wei) return "0";
  return (Number(wei) / LAMPORTS_PER_SOL).toFixed(4);
}

export function formatMultFromWad(wad: bigint | undefined): string {
  if (!wad) return "1.00×";
  return (Number(wad) / GAME_CONFIG.BPS_DENOMINATOR).toFixed(2) + "×";
}
