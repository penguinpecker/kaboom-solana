"use client";
import {
  createContext, useContext, useState, useCallback, useEffect, ReactNode,
} from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Transaction, TransactionInstruction, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { GAME_CONFIG, HOUSE_SERVER } from "@/lib/chain";

type GameStatus = "idle" | "starting" | "playing" | "revealing" | "cashing" | "won" | "lost";

export interface GameResult {
  gameId: string; player: string; won: boolean; bet: number;
  payout: number; multiplier: number; mineCount: number;
  tilesCleared: number; txHash: string; timestamp: number;
}

interface GameState {
  gameId: bigint | null; status: GameStatus; bet: number; mineCount: number;
  revealedTiles: Set<number>; safeTiles: Set<number>; mineTiles: Set<number>;
  optimisticTiles: Set<number>; multiplier: number; commitment: string;
  payout: number; pendingTile: number | null; sessionPnl: number;
  sessionGames: number; error: string | null; lastTxHash: string | null;
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
  optimisticTiles: new Set(), multiplier: 1.0, commitment: "", payout: 0,
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

async function callServer(path: string, body?: object): Promise<any> {
  const res = await fetch(`${HOUSE_SERVER}${path}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);
  return data;
}

// ── Local demo mode (fallback when server is unavailable) ───────────────────
let localMines = new Set<number>();

function generateLocalMines(count: number): Set<number> {
  const mines = new Set<number>();
  while (mines.size < count) mines.add(Math.floor(Math.random() * GAME_CONFIG.GRID_SIZE));
  return mines;
}

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GameState>(initialState);
  const [gameHistory, setGameHistory] = useState<GameResult[]>([]);
  const [useOnChain, setUseOnChain] = useState(true);
  const { connection } = useConnection();
  const wallet = useWallet();

  useEffect(() => { setGameHistory(loadHistory()); }, []);

  // Check if house server is available
  useEffect(() => {
    callServer("/health")
      .then(() => setUseOnChain(true))
      .catch(() => {
        console.warn("House server unavailable, using local demo mode");
        setUseOnChain(false);
      });
  }, []);

  const setBet = useCallback((bet: number) => setState(prev => ({ ...prev, bet })), []);
  const setMineCount = useCallback((count: number) => setState(prev => ({ ...prev, mineCount: count })), []);

  // ── START GAME ──────────────────────────────────────────────────────────────
  const startGame = useCallback(async () => {
    if (!wallet.publicKey || !wallet.signTransaction) {
      setState(prev => ({ ...prev, error: "Connect wallet first" }));
      return;
    }

    setState(prev => ({ ...prev, status: "starting", error: null }));

    try {
      if (useOnChain) {
        // 1. Get commitment + instruction from house server
        const betLamports = Math.round(state.bet * LAMPORTS_PER_SOL);
        const commitData = await callServer("/api/commit", {
          player: wallet.publicKey.toBase58(),
          mineCount: state.mineCount,
          betLamports,
        });

        // 2. Reconstruct the instruction from server response
        const ix = new TransactionInstruction({
          programId: new PublicKey(commitData.instruction.programId),
          keys: commitData.instruction.keys.map((k: any) => ({
            pubkey: new PublicKey(k.pubkey),
            isSigner: k.isSigner,
            isWritable: k.isWritable,
          })),
          data: Buffer.from(commitData.instruction.data, "base64"),
        });

        // 3. Build transaction, player signs and sends
        const tx = new Transaction().add(ix);
        const { blockhash, lastValidBlockHeight } =
          await connection.getLatestBlockhash("confirmed");
        tx.recentBlockhash = blockhash;
        tx.lastValidBlockHeight = lastValidBlockHeight;
        tx.feePayer = wallet.publicKey;

        const signed = await wallet.signTransaction(tx);
        const sig = await connection.sendRawTransaction(signed.serialize());
        await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");

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
          optimisticTiles: new Set(),
          multiplier: 1.0,
          payout: 0,
          pendingTile: null,
        }));
      } else {
        // Local demo mode
        localMines = generateLocalMines(state.mineCount);
        setState(prev => ({
          ...prev,
          gameId: BigInt(Date.now()),
          status: "playing",
          commitment: "local-demo",
          error: null,
          revealedTiles: new Set(),
          safeTiles: new Set(),
          mineTiles: new Set(),
          optimisticTiles: new Set(),
          multiplier: 1.0,
          payout: 0,
          pendingTile: null,
        }));
      }
    } catch (err: any) {
      console.error("Start game failed:", err);
      setState(prev => ({ ...prev, status: "idle", error: err.message }));
    }
  }, [wallet, state.bet, state.mineCount, useOnChain, connection]);

  // ── REVEAL TILE ─────────────────────────────────────────────────────────────
  const revealTile = useCallback(async (index: number) => {
    if (state.status !== "playing" || state.pendingTile !== null) return;
    if (state.revealedTiles.has(index)) return;

    setState(prev => ({ ...prev, pendingTile: index, status: "revealing" }));

    try {
      if (useOnChain) {
        const data = await callServer("/api/reveal", {
          player: wallet.publicKey?.toBase58(),
          tileIndex: index,
        });

        if (data.isMine) {
          // Reveal ALL mines on loss
          setState(prev => {
            const newRevealed = new Set(Array.from(prev.revealedTiles));
            const newMines = new Set(Array.from(prev.mineTiles));
            newRevealed.add(index);
            newMines.add(index);

            const result: GameResult = {
              gameId: prev.gameId?.toString() || "0",
              player: wallet.publicKey?.toBase58() || "",
              won: false, bet: prev.bet, payout: 0, multiplier: 0,
              mineCount: prev.mineCount, tilesCleared: prev.safeTiles.size,
              txHash: data.signature || "", timestamp: Date.now(),
            };
            saveResult(result);

            return {
              ...prev, status: "lost" as GameStatus,
              revealedTiles: newRevealed, mineTiles: newMines,
              pendingTile: null, lastTxHash: data.signature,
              sessionGames: prev.sessionGames + 1,
              sessionPnl: prev.sessionPnl - prev.bet,
            };
          });
          setGameHistory(loadHistory());
        } else {
          setState(prev => {
            const newRevealed = new Set(Array.from(prev.revealedTiles));
            newRevealed.add(index);
            const newSafe = new Set(Array.from(prev.safeTiles));
            newSafe.add(index);
            const newMult = calcMultiplier(newSafe.size, prev.mineCount);
            const totalSafe = GAME_CONFIG.GRID_SIZE - prev.mineCount;

            return {
              ...prev,
              status: newSafe.size >= totalSafe ? "won" as GameStatus : "playing" as GameStatus,
              revealedTiles: newRevealed,
              safeTiles: newSafe,
              multiplier: newMult,
              pendingTile: null,
              lastTxHash: data.signature,
            };
          });
        }
      } else {
        // Local demo mode
        const isMine = localMines.has(index);
        if (isMine) {
          setState(prev => {
            const newRevealed = new Set(Array.from(prev.revealedTiles));
            const newMines = new Set(Array.from(prev.mineTiles));
            newRevealed.add(index);
            newMines.add(index);
            localMines.forEach(m => { newRevealed.add(m); newMines.add(m); });

            const result: GameResult = {
              gameId: prev.gameId?.toString() || "0",
              player: wallet.publicKey?.toBase58() || "demo",
              won: false, bet: prev.bet, payout: 0, multiplier: 0,
              mineCount: prev.mineCount, tilesCleared: prev.safeTiles.size,
              txHash: "", timestamp: Date.now(),
            };
            saveResult(result);

            return {
              ...prev, status: "lost" as GameStatus,
              revealedTiles: newRevealed, mineTiles: newMines,
              pendingTile: null,
              sessionGames: prev.sessionGames + 1,
              sessionPnl: prev.sessionPnl - prev.bet,
            };
          });
          setGameHistory(loadHistory());
        } else {
          setState(prev => {
            const newRevealed = new Set(Array.from(prev.revealedTiles));
            newRevealed.add(index);
            const newSafe = new Set(Array.from(prev.safeTiles));
            newSafe.add(index);
            const newMult = calcMultiplier(newSafe.size, prev.mineCount);
            const totalSafe = GAME_CONFIG.GRID_SIZE - prev.mineCount;

            return {
              ...prev,
              revealedTiles: newRevealed, safeTiles: newSafe,
              multiplier: newMult, pendingTile: null,
              status: newSafe.size >= totalSafe ? "won" as GameStatus : "playing" as GameStatus,
            };
          });
        }
      }
    } catch (err: any) {
      console.error("Reveal failed:", err);
      setState(prev => ({ ...prev, pendingTile: null, status: "playing", error: err.message }));
    }
  }, [state.status, state.pendingTile, state.revealedTiles, useOnChain, wallet.publicKey]);

  // ── CASH OUT ────────────────────────────────────────────────────────────────
  const cashOut = useCallback(async () => {
    if (state.status !== "playing" || state.safeTiles.size === 0) return;

    setState(prev => ({ ...prev, status: "cashing" }));

    try {
      const payout = state.bet * state.multiplier;

      if (useOnChain) {
        // TODO: Player signs cash_out instruction on-chain
        // For now, just settle via server
        const settleData = await callServer("/api/settle", {
          player: wallet.publicKey?.toBase58(),
        });

        setState(prev => {
          const result: GameResult = {
            gameId: prev.gameId?.toString() || "0",
            player: wallet.publicKey?.toBase58() || "",
            won: true, bet: prev.bet, payout, multiplier: prev.multiplier,
            mineCount: prev.mineCount, tilesCleared: prev.safeTiles.size,
            txHash: settleData.signature || "", timestamp: Date.now(),
          };
          saveResult(result);

          return {
            ...prev, status: "won" as GameStatus, payout,
            lastTxHash: settleData.signature,
            sessionGames: prev.sessionGames + 1,
            sessionPnl: prev.sessionPnl + (payout - prev.bet),
          };
        });
      } else {
        setState(prev => {
          const result: GameResult = {
            gameId: prev.gameId?.toString() || "0",
            player: wallet.publicKey?.toBase58() || "demo",
            won: true, bet: prev.bet, payout, multiplier: prev.multiplier,
            mineCount: prev.mineCount, tilesCleared: prev.safeTiles.size,
            txHash: "", timestamp: Date.now(),
          };
          saveResult(result);

          return {
            ...prev, status: "won" as GameStatus, payout,
            sessionGames: prev.sessionGames + 1,
            sessionPnl: prev.sessionPnl + (payout - prev.bet),
          };
        });
      }
      setGameHistory(loadHistory());
    } catch (err: any) {
      console.error("Cash out failed:", err);
      setState(prev => ({ ...prev, status: "playing", error: err.message }));
    }
  }, [state.status, state.safeTiles, state.bet, state.multiplier, useOnChain, wallet.publicKey]);

  // ── RESET ───────────────────────────────────────────────────────────────────
  const resetGame = useCallback(() => {
    setState(prev => ({
      ...initialState,
      bet: prev.bet, mineCount: prev.mineCount,
      sessionPnl: prev.sessionPnl, sessionGames: prev.sessionGames,
    }));
  }, []);

  const value = { state, setBet, setMineCount, startGame, revealTile, cashOut, resetGame, gameHistory };
  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame must be used within GameProvider");
  return ctx;
}
