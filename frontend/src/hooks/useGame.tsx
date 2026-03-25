"use client";
import {
  createContext, useContext, useState, useCallback, useEffect, ReactNode,
} from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { GAME_CONFIG } from "@/lib/chain";

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
  gameId: null, status: "idle", bet: 0.1, mineCount: 5,
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

// Generate random mine positions
function generateMines(count: number): Set<number> {
  const mines = new Set<number>();
  while (mines.size < count) {
    mines.add(Math.floor(Math.random() * GAME_CONFIG.GRID_SIZE));
  }
  return mines;
}

let minePositions = new Set<number>();

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GameState>(initialState);
  const [gameHistory, setGameHistory] = useState<GameResult[]>([]);
  const wallet = useWallet();

  useEffect(() => { setGameHistory(loadHistory()); }, []);

  const setBet = useCallback((bet: number) => setState(prev => ({ ...prev, bet })), []);
  const setMineCount = useCallback((count: number) => setState(prev => ({ ...prev, mineCount: count })), []);

  const startGame = useCallback(() => {
    if (!wallet.publicKey) {
      setState(prev => ({ ...prev, error: "Connect wallet first" }));
      return;
    }

    // Generate mines locally (will be server-side in production)
    minePositions = generateMines(state.mineCount);

    setState(prev => ({
      ...prev,
      gameId: BigInt(Date.now()),
      status: "playing",
      commitment: "local-demo-mode",
      error: null,
      revealedTiles: new Set(),
      safeTiles: new Set(),
      mineTiles: new Set(),
      optimisticTiles: new Set(),
      multiplier: 1.0,
      payout: 0,
      pendingTile: null,
    }));
  }, [wallet.publicKey, state.mineCount]);

  const revealTile = useCallback((index: number) => {
    if (state.status !== "playing" || state.pendingTile !== null) return;
    if (state.revealedTiles.has(index)) return;

    const isMine = minePositions.has(index);

    if (isMine) {
      // Reveal ALL mines on loss
      setState(prev => {
        const newRevealed = new Set(Array.from(prev.revealedTiles));
        const newMines = new Set(Array.from(prev.mineTiles));
        newRevealed.add(index);
        newMines.add(index);
        minePositions.forEach(m => { newRevealed.add(m); newMines.add(m); });

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
          revealedTiles: newRevealed,
          safeTiles: newSafe,
          multiplier: newMult,
          pendingTile: null,
          status: newSafe.size >= totalSafe ? "won" as GameStatus : "playing" as GameStatus,
        };
      });
    }
  }, [state.status, state.pendingTile, state.revealedTiles, wallet.publicKey]);

  const cashOut = useCallback(() => {
    if (state.status !== "playing" || state.safeTiles.size === 0) return;
    const payout = state.bet * state.multiplier;

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
    setGameHistory(loadHistory());
  }, [state.status, state.safeTiles, state.bet, state.multiplier, wallet.publicKey]);

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
