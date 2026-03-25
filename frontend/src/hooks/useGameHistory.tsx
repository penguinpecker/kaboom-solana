"use client";
import { useState, useEffect, useCallback } from "react";
import { GameResult } from "@/hooks/useGame";

const STORAGE_KEY = "kaboom_game_history";

export function useGameHistory() {
  const [history, setHistory] = useState<GameResult[]>([]);

  const refresh = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      setHistory(raw ? JSON.parse(raw) : []);
    } catch {
      setHistory([]);
    }
  }, []);

  // Load on mount
  useEffect(() => { refresh(); }, [refresh]);

  // Refresh when tab gets focus (user switches back from game)
  useEffect(() => {
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);

  // Refresh on storage events (cross-tab sync)
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) refresh();
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [refresh]);

  // Also poll every 2 seconds for same-tab updates
  useEffect(() => {
    const interval = setInterval(refresh, 2000);
    return () => clearInterval(interval);
  }, [refresh]);

  const clearHistory = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setHistory([]);
  }, []);

  return { history, refresh, clearHistory };
}
