"use client";
import { useGame } from "@/hooks/useGame";
import { usePrivy } from "@privy-io/react-auth";
import { useWallets, useCreateWallet } from "@privy-io/react-auth/solana";
import { useConnection } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useState, useEffect } from "react";

export default function BetControls() {
  const { state, setBet, setMineCount, startGame, cashOut, resetGame } = useGame();
  const { authenticated, login } = usePrivy();
  const { wallets } = useWallets();
  const wallet = wallets[0];
  const { connection } = useConnection();
  const [balance, setBalance] = useState(0);

  useEffect(() => {
    if (!wallet?.address) return;
    let cancelled = false;
    const fetchBal = async () => {
      try {
        const { PublicKey } = await import("@solana/web3.js");
        const bal = await connection.getBalance(new PublicKey(wallet.address));
        if (!cancelled) setBalance(bal / LAMPORTS_PER_SOL);
      } catch {}
    };
    fetchBal();
    const id = setInterval(fetchBal, 10000);
    return () => { cancelled = true; clearInterval(id); };
  }, [wallet?.address, connection]);

  const isPlaying = state.status === "playing";
  const isGameOver = state.status === "won" || state.status === "lost";
  const isLoading = state.status === "starting" || state.status === "revealing" || state.status === "cashing" || state.status === "cleaning";

  return (
    <div className="space-y-4">
      {state.error && (
        <div className="rounded-lg bg-red-900/30 border border-red-800 p-3 text-sm text-red-300">
          {state.error}
        </div>
      )}

      {!isPlaying && !isGameOver && (
        <>
          <div>
            <label className="text-sm text-zinc-400">Bet (SOL)</label>
            <input
              type="number"
              step="0.001"
              min="0.001"
              max={balance}
              value={state.bet}
              onChange={(e) => setBet(parseFloat(e.target.value) || 0.005)}
              disabled={isLoading}
              className="mt-1 w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-white text-sm"
            />
          </div>

          <div>
            <label className="text-sm text-zinc-400">Mines ({state.mineCount})</label>
            <input
              type="range"
              min="1"
              max="12"
              value={state.mineCount}
              onChange={(e) => setMineCount(parseInt(e.target.value))}
              disabled={isLoading}
              className="mt-1 w-full"
            />
            <div className="flex justify-between text-xs text-zinc-500">
              <span>1</span><span>12</span>
            </div>
          </div>
        </>
      )}

      {isPlaying && (
        <div className="space-y-2">
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-400">{state.multiplier.toFixed(2)}x</div>
            <div className="text-sm text-zinc-400">
              Payout: {(state.bet * state.multiplier).toFixed(4)} SOL
            </div>
          </div>
          <button
            onClick={cashOut}
            disabled={state.safeTiles.size === 0 || state.status === "cashing"}
            className="w-full rounded-lg bg-green-600 py-3 text-sm font-bold text-white hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {state.status === "cashing" ? "Cashing out..." : "Cash Out"}
          </button>
        </div>
      )}

      {isGameOver && (
        <div className="space-y-3 text-center">
          {state.status === "won" ? (
            <div className="text-green-400 font-bold">
              Won {state.payout.toFixed(4)} SOL ({state.multiplier.toFixed(2)}x)
            </div>
          ) : (
            <div className="text-red-400 font-bold">BOOM! Lost {state.bet} SOL</div>
          )}
          <button
            onClick={resetGame}
            className="w-full rounded-lg bg-zinc-700 py-2 text-sm text-white hover:bg-zinc-600 transition-colors"
          >
            Play Again
          </button>
        </div>
      )}

      {!isPlaying && !isGameOver && (
        <button
          onClick={authenticated ? startGame : login}
          disabled={isLoading}
          className="w-full rounded-lg bg-orange-600 py-3 text-sm font-bold text-white hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? (state.status === "cleaning" ? "Cleaning up..." : "Starting...") : authenticated ? "Engage Bet" : "Connect to Play"}
        </button>
      )}

      <div className="text-xs text-zinc-500 text-center">
        {authenticated && wallet ? (
          <span>Balance: {balance.toFixed(4)} SOL</span>
        ) : (
          <span>Connect wallet to play</span>
        )}
      </div>
    </div>
  );
}
