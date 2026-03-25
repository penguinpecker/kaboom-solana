"use client";
import {
  createContext, useContext, useState, useCallback, useEffect, ReactNode,
} from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Transaction, TransactionInstruction, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { GAME_CONFIG } from "@/lib/chain";

type GameStatus = "idle" | "starting" | "playing" | "revealing" | "cashing" | "won" | "lost" | "cleaning";

export interface GameResult {
  gameId: string; player: string; won: boolean; bet: number;
  payout: number; multiplier: number; mineCount: number;
  tilesCleared: number; txHash: string; timestamp: number;
}

interface GameState {
  gameId: bigint | null; status: GameStatus; bet: number; mineCount: number;
  revealedTiles: Set<number>; safeTiles: Set<number>; mineTiles: Set<number>;
  multiplier: number; commitment: string; payout: number;
  pendingTile: number | null; sessionPnl: number; sessionGames: number;
  error: string | null; lastTxHash: string | null;
}

interface GameContextType {
  state: GameState; setBet: (bet: number) => void;
  setMineCount: (count: number) => void; startGame: () => void;
  revealTile: (index: number) => void; cashOut: () => void;
  resetGame: () => void; gameHistory: GameResult[];
}

const initialState: GameState = {
  gameId: null, status: "idle", bet: 0.005, mineCount: 3,
  revealedTiles: new Set(), safeTiles: new Set(), mineTiles: new Set(),
  multiplier: 1.0, commitment: "", payout: 0,
  pendingTile: null, sessionPnl: 0, sessionGames: 0, error: null, lastTxHash: null,
};

const GameContext = createContext<GameContextType | null>(null);

const STORAGE_KEY = "kaboom_game_history";
function loadHistory(): GameResult[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
}
function saveResult(result: GameResult) {
  if (typeof window === "undefined") return;
  try {
    const h = loadHistory(); h.unshift(result);
    if (h.length > 100) h.length = 100;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(h));
  } catch {}
}

function calcMultiplier(safeReveals: number, mineCount: number): number {
  let m = 1;
  for (let i = 0; i < safeReveals; i++) {
    const remaining = GAME_CONFIG.GRID_SIZE - i;
    const safeRemaining = GAME_CONFIG.GRID_SIZE - mineCount - i;
    if (safeRemaining > 0) m *= remaining / safeRemaining;
  }
  return m * (1 - GAME_CONFIG.HOUSE_EDGE);
}

async function api(path: string, body?: object): Promise<any> {
  const res = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Server error " + res.status);
  return data;
}

function deserializeIx(ix: any): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(ix.programId),
    keys: ix.keys.map((k: any) => ({
      pubkey: new PublicKey(k.pubkey),
      isSigner: k.isSigner,
      isWritable: k.isWritable,
    })),
    data: Buffer.from(ix.data, "base64"),
  });
}

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GameState>(initialState);
  const [gameHistory, setGameHistory] = useState<GameResult[]>([]);
  const { connection } = useConnection();
  const wallet = useWallet();

  useEffect(() => { setGameHistory(loadHistory()); }, []);

  const setBet = useCallback((bet: number) => setState(prev => ({ ...prev, bet })), []);
  const setMineCount = useCallback((count: number) => setState(prev => ({ ...prev, mineCount: count })), []);

  // Sign and send a transaction via wallet
  async function signAndSend(ix: TransactionInstruction): Promise<string> {
    if (!wallet.publicKey || !wallet.signTransaction) throw new Error("Wallet not connected");
    const tx = new Transaction().add(ix);
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    tx.lastValidBlockHeight = lastValidBlockHeight;
    tx.feePayer = wallet.publicKey;
    const signed = await wallet.signTransaction(tx);
    const sig = await connection.sendRawTransaction(signed.serialize());
    await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
    return sig;
  }

  // Clean up a stuck game PDA — refund + close
  async function cleanupStuckGame(): Promise<boolean> {
    if (!wallet.publicKey) return false;
    setState(prev => ({ ...prev, status: "cleaning", error: "Cleaning up stuck game..." }));
    try {
      const data = await api("/api/cleanup", { player: wallet.publicKey.toBase58() });
      if (!data.active) return false;

      // Try refund_expired (returns bet to player)
      try {
        await signAndSend(deserializeIx(data.refundInstruction));
        console.log("Refund confirmed");
      } catch (e: any) {
        console.log("Refund skipped:", e.message?.slice(0, 80));
      }

      // Wait a moment then close the PDA (reclaim rent)
      await new Promise(r => setTimeout(r, 2000));
      try {
        await signAndSend(deserializeIx(data.closeInstruction));
        console.log("Game PDA closed");
      } catch (e: any) {
        console.log("Close skipped:", e.message?.slice(0, 80));
      }

      setState(prev => ({ ...prev, status: "idle", error: null }));
      return true;
    } catch (e: any) {
      console.error("Cleanup failed:", e);
      setState(prev => ({ ...prev, status: "idle", error: "Cleanup failed: " + e.message }));
      return false;
    }
  }

  const startGame = useCallback(async () => {
    if (!wallet.publicKey || !wallet.signTransaction) {
      setState(prev => ({ ...prev, error: "Connect wallet first" }));
      return;
    }
    setState(prev => ({ ...prev, status: "starting", error: null }));

    try {
      const betLamports = Math.round(state.bet * LAMPORTS_PER_SOL);
      let commitData: any;
      try {
        commitData = await api("/api/commit", {
          player: wallet.publicKey.toBase58(),
          mineCount: state.mineCount,
          betLamports,
        });
      } catch (commitErr: any) {
        // If stuck game exists, auto-cleanup and retry
        if (commitErr.message?.includes("Close it first") || commitErr.message?.includes("needsCleanup")) {
          const cleaned = await cleanupStuckGame();
          if (cleaned) {
            // Retry commit after cleanup
            commitData = await api("/api/commit", {
              player: wallet.publicKey.toBase58(),
              mineCount: state.mineCount,
              betLamports,
            });
          } else {
            throw new Error("Could not clean up stuck game. Try again.");
          }
        } else {
          throw commitErr;
        }
      }

      const ix = deserializeIx(commitData.instruction);
      const sig = await signAndSend(ix);

      setState(prev => ({
        ...prev,
        gameId: BigInt(Date.now()),
        status: "playing",
        commitment: commitData.commitment,
        lastTxHash: sig,
        error: null,
        revealedTiles: new Set(),
        safeTiles: new Set(),
        mineTiles: new Set(),
        multiplier: 1.0,
        payout: 0,
        pendingTile: null,
      }));
    } catch (err: any) {
      console.error("Start game failed:", err);
      setState(prev => ({ ...prev, status: "idle", error: err.message }));
    }
  }, [wallet, state.bet, state.mineCount, connection]);

  const revealTile = useCallback(async (index: number) => {
    if (state.status !== "playing" || state.pendingTile !== null) return;
    if (state.revealedTiles.has(index)) return;
    setState(prev => ({ ...prev, pendingTile: index, status: "revealing" }));

    try {
      const data = await api("/api/reveal", {
        player: wallet.publicKey?.toBase58(),
        tileIndex: index,
      });

      if (data.isMine) {
        setState(prev => {
          const newRevealed = new Set(Array.from(prev.revealedTiles));
          const newMines = new Set(Array.from(prev.mineTiles));
          newRevealed.add(index); newMines.add(index);
          saveResult({ gameId: prev.gameId?.toString() || "0", player: wallet.publicKey?.toBase58() || "", won: false, bet: prev.bet, payout: 0, multiplier: 0, mineCount: prev.mineCount, tilesCleared: prev.safeTiles.size, txHash: data.signature || "", timestamp: Date.now() });
          return { ...prev, status: "lost" as GameStatus, revealedTiles: newRevealed, mineTiles: newMines, pendingTile: null, lastTxHash: data.signature, sessionGames: prev.sessionGames + 1, sessionPnl: prev.sessionPnl - prev.bet };
        });
        setGameHistory(loadHistory());
      } else {
        setState(prev => {
          const newRevealed = new Set(Array.from(prev.revealedTiles)); newRevealed.add(index);
          const newSafe = new Set(Array.from(prev.safeTiles)); newSafe.add(index);
          const newMult = calcMultiplier(newSafe.size, prev.mineCount);
          const totalSafe = GAME_CONFIG.GRID_SIZE - prev.mineCount;
          return { ...prev, status: newSafe.size >= totalSafe ? "won" as GameStatus : "playing" as GameStatus, revealedTiles: newRevealed, safeTiles: newSafe, multiplier: newMult, pendingTile: null, lastTxHash: data.signature };
        });
      }
    } catch (err: any) {
      console.error("Reveal failed:", err);
      setState(prev => ({ ...prev, pendingTile: null, status: "playing", error: err.message }));
    }
  }, [state.status, state.pendingTile, state.revealedTiles, wallet.publicKey]);

  const cashOut = useCallback(async () => {
    if (state.status !== "playing" || state.safeTiles.size === 0) return;
    setState(prev => ({ ...prev, status: "cashing" }));
    try {
      const payout = state.bet * state.multiplier;
      const settleData = await api("/api/settle", { player: wallet.publicKey?.toBase58() });
      setState(prev => {
        saveResult({ gameId: prev.gameId?.toString() || "0", player: wallet.publicKey?.toBase58() || "", won: true, bet: prev.bet, payout, multiplier: prev.multiplier, mineCount: prev.mineCount, tilesCleared: prev.safeTiles.size, txHash: settleData.signature || "", timestamp: Date.now() });
        return { ...prev, status: "won" as GameStatus, payout, lastTxHash: settleData.signature, sessionGames: prev.sessionGames + 1, sessionPnl: prev.sessionPnl + (payout - prev.bet) };
      });
      setGameHistory(loadHistory());
    } catch (err: any) {
      console.error("Cash out failed:", err);
      setState(prev => ({ ...prev, status: "playing", error: err.message }));
    }
  }, [state.status, state.safeTiles, state.bet, state.multiplier, wallet.publicKey]);

  const resetGame = useCallback(() => {
    setState(prev => ({ ...initialState, bet: prev.bet, mineCount: prev.mineCount, sessionPnl: prev.sessionPnl, sessionGames: prev.sessionGames }));
  }, []);

  return <GameContext.Provider value={{ state, setBet, setMineCount, startGame, revealTile, cashOut, resetGame, gameHistory }}>{children}</GameContext.Provider>;
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame must be used within GameProvider");
  return ctx;
}
