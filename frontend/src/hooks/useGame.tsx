"use client";
import {
  createContext, useContext, useState, useCallback, useEffect, ReactNode, useMemo, useRef,
} from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { usePrivy } from "@privy-io/react-auth";
import { useWallets, useCreateWallet, useSignTransaction } from "@privy-io/react-auth/solana";
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
  walletAddress: string | null; authenticated: boolean;
  login: () => void; logout: () => void;
}

const initialState: GameState = {
  gameId: null, status: "idle", bet: 0.005, mineCount: 3,
  revealedTiles: new Set(), safeTiles: new Set(), mineTiles: new Set(),
  multiplier: 1.0, commitment: "", payout: 0,
  pendingTile: null, sessionPnl: 0, sessionGames: 0, error: null, lastTxHash: null,
};

const GameContext = createContext<GameContextType | null>(null);

// ─── Helpers ─────────────────────────────────────────────────────────────────

const HISTORY_KEY = "kaboom_game_history";
const TOKEN_KEY = "kaboom_game_token";

function loadHistory(): GameResult[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); } catch { return []; }
}

function saveResult(r: GameResult) {
  if (typeof window === "undefined") return;
  const h = loadHistory(); h.unshift(r);
  if (h.length > 100) h.length = 100;
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h)); } catch {}
}

function saveToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

function loadToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
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

async function api(path: string, body: object): Promise<any> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Server error " + res.status);
  return data;
}

function deserializeIx(ix: any): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(ix.programId),
    keys: ix.keys.map((k: any) => ({
      pubkey: new PublicKey(k.pubkey), isSigner: k.isSigner, isWritable: k.isWritable,
    })),
    data: Buffer.from(ix.data, "base64"),
  });
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GameState>(initialState);
  const [gameHistory, setGameHistory] = useState<GameResult[]>([]);
  const gameTokenRef = useRef<string | null>(null);
  const { connection } = useConnection();
  const { authenticated, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const { createWallet } = useCreateWallet();
  const { signTransaction } = useSignTransaction();

  const wallet = useMemo(() => wallets[0] || null, [wallets]);
  const walletAddress = wallet?.address || null;

  useEffect(() => { setGameHistory(loadHistory()); }, []);

  // Auto-create Solana wallet if logged in but none exists
  useEffect(() => {
    if (authenticated && wallets.length === 0) {
      createWallet().catch(() => {});
    }
  }, [authenticated, wallets.length, createWallet]);

  // Restore token from localStorage
  useEffect(() => {
    gameTokenRef.current = loadToken();
  }, []);

  const setBet = useCallback((bet: number) => setState(p => ({ ...p, bet })), []);
  const setMineCount = useCallback((count: number) => setState(p => ({ ...p, mineCount: count })), []);

  // Sign and send a transaction using Privy wallet
  async function signAndSend(ix: TransactionInstruction): Promise<string> {
    if (!wallet) throw new Error("No wallet");
    const tx = new Transaction().add(ix);
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    tx.lastValidBlockHeight = lastValidBlockHeight;
    tx.feePayer = new PublicKey(wallet.address);
    const serialized = tx.serialize({ requireAllSignatures: false });
    const { signedTransaction } = await signTransaction({ transaction: serialized, wallet: wallet as any });
    const raw = signedTransaction instanceof Uint8Array ? signedTransaction : Buffer.from(signedTransaction);
    const sig = await connection.sendRawTransaction(raw);
    await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
    return sig;
  }

  // Cleanup stuck game PDA
  async function cleanupStuckGame(): Promise<boolean> {
    if (!wallet) return false;
    setState(p => ({ ...p, status: "cleaning", error: "Cleaning up stuck game..." }));
    try {
      const data = await api("/api/cleanup", {
        player: wallet.address,
        gameToken: gameTokenRef.current || undefined,
      });
      if (!data.active) { setState(p => ({ ...p, status: "idle", error: null })); return false; }

      // Try close first (works if game is settled), then refund (works if expired)
      if (data.closeInstruction) {
        try { await signAndSend(deserializeIx(data.closeInstruction)); saveToken(null); gameTokenRef.current = null; setState(p => ({ ...p, status: "idle", error: null })); return true; } catch (e: any) { console.log("Close failed, trying refund:", e.message?.slice(0, 80)); }
      }
      if (data.refundInstruction) {
        try { await signAndSend(deserializeIx(data.refundInstruction)); } catch (e: any) { console.log("Refund:", e.message?.slice(0, 80)); }
        await new Promise(r => setTimeout(r, 2000));
        if (data.closeInstruction) {
          try { await signAndSend(deserializeIx(data.closeInstruction)); } catch (e: any) { console.log("Close after refund:", e.message?.slice(0, 80)); }
        }
        saveToken(null); gameTokenRef.current = null;
        setState(p => ({ ...p, status: "idle", error: null }));
        return true;
      }

      setState(p => ({ ...p, status: "idle", error: null }));
      return false;
    } catch (e: any) {
      setState(p => ({ ...p, status: "idle", error: "Cleanup failed: " + e.message }));
      return false;
    }
  }

  // ── START GAME ──────────────────────────────────────────────────────────────

  const startGame = useCallback(async () => {
    if (!authenticated) { login(); return; }
    if (!wallet) { setState(p => ({ ...p, error: "Wallet not ready" })); return; }
    setState(p => ({ ...p, status: "starting", error: null }));

    try {
      const betLamports = Math.round(state.bet * LAMPORTS_PER_SOL);
      let commitData: any;
      try {
        commitData = await api("/api/commit", { player: wallet.address, mineCount: state.mineCount, betLamports });
      } catch (err: any) {
        if (err.message?.includes("Close it first") || err.message?.includes("active game")) {
          if (await cleanupStuckGame()) {
            commitData = await api("/api/commit", { player: wallet.address, mineCount: state.mineCount, betLamports });
          } else throw new Error("Could not clean up stuck game. Try again in a moment.");
        } else throw err;
      }

      // Store the game token
      gameTokenRef.current = commitData.gameToken;
      saveToken(commitData.gameToken);

      // Player signs start_game tx
      const sig = await signAndSend(deserializeIx(commitData.instruction));

      setState(p => ({
        ...p, gameId: BigInt(Date.now()), status: "playing",
        commitment: commitData.commitment, lastTxHash: sig, error: null,
        revealedTiles: new Set(), safeTiles: new Set(), mineTiles: new Set(),
        multiplier: 1.0, payout: 0, pendingTile: null,
      }));
    } catch (err: any) {
      console.error("Start game failed:", err);
      setState(p => ({ ...p, status: "idle", error: err.message }));
    }
  }, [authenticated, wallet, state.bet, state.mineCount, connection, login]);

  // ── REVEAL TILE ─────────────────────────────────────────────────────────────

  const revealTile = useCallback(async (index: number) => {
    if (state.status !== "playing" || state.pendingTile !== null) return;
    if (state.revealedTiles.has(index)) return;
    setState(p => ({ ...p, pendingTile: index, status: "revealing" }));

    try {
      const data = await api("/api/reveal", {
        player: wallet?.address,
        tileIndex: index,
        gameToken: gameTokenRef.current,
      });

      // Update token
      if (data.gameToken) {
        gameTokenRef.current = data.gameToken;
        saveToken(data.gameToken);
      }

      if (data.isMine) {
        // Keep gameToken for cleanup — server needs it to settle
        // Auto-close game PDA after loss (settle already done by server)
        setTimeout(async () => {
          try {
            const closeData = await api("/api/cleanup", { player: wallet?.address, gameToken: gameTokenRef.current }); saveToken(null); gameTokenRef.current = null;
            if (closeData.active && closeData.closeInstruction) {
              await signAndSend(deserializeIx(closeData.closeInstruction)).catch(() => {});
            }
          } catch {}
        }, 3000);
        setState(p => {
          const nr = new Set(Array.from(p.revealedTiles)); nr.add(index);
          const nm = new Set(Array.from(p.mineTiles)); nm.add(index);
          saveResult({ gameId: p.gameId?.toString() || "0", player: wallet?.address || "", won: false, bet: p.bet, payout: 0, multiplier: 0, mineCount: p.mineCount, tilesCleared: p.safeTiles.size, txHash: data.signature || "", timestamp: Date.now() });
          return { ...p, status: "lost" as GameStatus, revealedTiles: nr, mineTiles: nm, pendingTile: null, lastTxHash: data.signature, sessionGames: p.sessionGames + 1, sessionPnl: p.sessionPnl - p.bet };
        });
        setGameHistory(loadHistory());
      } else {
        setState(p => {
          const nr = new Set(Array.from(p.revealedTiles)); nr.add(index);
          const ns = new Set(Array.from(p.safeTiles)); ns.add(index);
          const mult = calcMultiplier(ns.size, p.mineCount);
          const totalSafe = GAME_CONFIG.GRID_SIZE - p.mineCount;
          return { ...p, status: ns.size >= totalSafe ? "won" as GameStatus : "playing" as GameStatus, revealedTiles: nr, safeTiles: ns, multiplier: mult, pendingTile: null, lastTxHash: data.signature };
        });
      }
    } catch (err: any) {
      console.error("Reveal failed:", err);
      setState(p => ({ ...p, pendingTile: null, status: "playing", error: err.message }));
    }
  }, [state.status, state.pendingTile, state.revealedTiles, wallet?.address]);

  // ── CASH OUT ────────────────────────────────────────────────────────────────

  const cashOut = useCallback(async () => {
    if (state.status !== "playing" || state.safeTiles.size === 0) return;
    setState(p => ({ ...p, status: "cashing" }));

    try {
      const payout = state.bet * state.multiplier;

      // Phase 1: Get cash_out instruction for player to sign
      const cashData = await api("/api/settle", { player: wallet?.address, gameToken: gameTokenRef.current });
      if (cashData.phase === "cashout") {
        const cashSig = await signAndSend(deserializeIx(cashData.instruction));
        console.log("Cash out confirmed:", cashSig);

        // Phase 2: Server settles with proof
        await new Promise(r => setTimeout(r, 2000));
        try {
          await api("/api/settle", { player: wallet?.address, gameToken: gameTokenRef.current, phase: "settle" });
        } catch {}
      }

      saveToken(null); gameTokenRef.current = null;
      // Auto-close game PDA after win
      setTimeout(async () => {
        try {
          const closeData = await api("/api/cleanup", { player: wallet?.address, gameToken: gameTokenRef.current }); saveToken(null); gameTokenRef.current = null;
          if (closeData.active && closeData.closeInstruction) {
            await signAndSend(deserializeIx(closeData.closeInstruction)).catch(() => {});
          }
        } catch {}
      }, 3000);

      setState(p => {
        saveResult({ gameId: p.gameId?.toString() || "0", player: wallet?.address || "", won: true, bet: p.bet, payout, multiplier: p.multiplier, mineCount: p.mineCount, tilesCleared: p.safeTiles.size, txHash: "", timestamp: Date.now() });
        return { ...p, status: "won" as GameStatus, payout, sessionGames: p.sessionGames + 1, sessionPnl: p.sessionPnl + (payout - p.bet) };
      });
      setGameHistory(loadHistory());
    } catch (err: any) {
      console.error("Cash out failed:", err);
      setState(p => ({ ...p, status: "playing", error: err.message }));
    }
  }, [state.status, state.safeTiles, state.bet, state.multiplier, wallet?.address]);

  // ── RESET ───────────────────────────────────────────────────────────────────

  const resetGame = useCallback(() => {
    saveToken(null); gameTokenRef.current = null;
    setState(p => ({ ...initialState, bet: p.bet, mineCount: p.mineCount, sessionPnl: p.sessionPnl, sessionGames: p.sessionGames }));
  }, []);

  return (
    <GameContext.Provider value={{ state, setBet, setMineCount, startGame, revealTile, cashOut, resetGame, gameHistory, walletAddress, authenticated, login, logout }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame must be used within GameProvider");
  return ctx;
}
