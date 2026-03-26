"use client";
import { useState, useCallback, useEffect } from "react";

export interface GameHistoryEntry {
  gameId: string;
  player: string;
  won: boolean;
  bet: number;
  payout: number;
  multiplier: number;
  mineCount: number;
  tilesCleared: number;
  txHash: string;
  timestamp: number;
}

const KEY = "kaboom_game_history";

function load(): GameHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}

export function useGameHistory() {
  const [history, setHistory] = useState<GameHistoryEntry[]>([]);

  useEffect(() => { setHistory(load()); }, []);

  const refresh = useCallback(() => { setHistory(load()); }, []);

  const clearHistory = useCallback(() => {
    localStorage.removeItem(KEY);
    setHistory([]);
  }, []);

  return { history, refresh, clearHistory };
}
