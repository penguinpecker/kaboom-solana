"use client";
import { useModal } from "@/hooks/useModal";
import { ModalShell } from "./ModalShell";
import { usePrivy } from "@privy-io/react-auth";
import { useWallets, useCreateWallet } from "@privy-io/react-auth/solana";
import { useConnection } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useState, useEffect } from "react";

function WalletModal() {
  const { close } = useModal();
  const { authenticated, login, logout, user } = usePrivy();
  const { wallets } = useWallets();
  const wallet = wallets[0];
  const { connection } = useConnection();
  const [balance, setBalance] = useState(0);

  useEffect(() => {
    if (!wallet?.address) return;
    let cancelled = false;
    (async () => {
      try {
        const { PublicKey } = await import("@solana/web3.js");
        const bal = await connection.getBalance(new PublicKey(wallet.address));
        if (!cancelled) setBalance(bal / LAMPORTS_PER_SOL);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [wallet?.address, connection]);

  if (!authenticated) {
    return (
      <ModalShell title="Connect">
        <div className="space-y-4 p-4">
          <p className="text-sm text-zinc-400">Login to start playing KABOOM!</p>
          <button onClick={() => { login(); close(); }} className="w-full rounded-lg bg-orange-600 py-3 text-sm font-bold text-white hover:bg-orange-500">
            Login with Privy
          </button>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell title="Wallet">
      <div className="space-y-4 p-4">
        <div>
          <div className="text-xs text-zinc-500">Address</div>
          <div className="text-sm text-white font-mono break-all">{wallet?.address || "No wallet"}</div>
        </div>
        <div>
          <div className="text-xs text-zinc-500">Balance</div>
          <div className="text-sm text-white">{balance.toFixed(4)} SOL</div>
        </div>
        {user?.email && (
          <div>
            <div className="text-xs text-zinc-500">Email</div>
            <div className="text-sm text-white">{user.email.address}</div>
          </div>
        )}
        <button onClick={() => { logout(); close(); }} className="w-full rounded-lg bg-zinc-700 py-2 text-sm text-white hover:bg-zinc-600">
          Disconnect
        </button>
      </div>
    </ModalShell>
  );
}

function DepositModal() {
  const { close } = useModal();
  return (
    <ModalShell title="Get Devnet SOL">
      <div className="space-y-4 p-4">
        <p className="text-sm text-zinc-400">Visit the Solana faucet to get free devnet SOL for testing.</p>
        <a href="https://faucet.solana.com" target="_blank" rel="noopener noreferrer" className="block w-full rounded-lg bg-orange-600 py-3 text-center text-sm font-bold text-white hover:bg-orange-500">
          Open Solana Faucet
        </a>
      </div>
    </ModalShell>
  );
}

function InfoModal() {
  const { close } = useModal();
  return (
    <ModalShell title="How to Play">
      <div className="space-y-3 p-4 text-sm text-zinc-300">
        <p>KABOOM! is a provably fair mines game on Solana.</p>
        <p>1. Set your bet and number of mines (more mines = higher multiplier)</p>
        <p>2. Click tiles to reveal them — avoid the mines!</p>
        <p>3. Cash out anytime to collect your winnings</p>
        <p>4. Every game is verified on-chain with commit-reveal cryptography</p>
      </div>
    </ModalShell>
  );
}

export default function ModalRoot() {
  const { modal } = useModal();
  if (!modal) return null;
  switch (modal) {
    case "wallet": return <WalletModal />;
    case "deposit": return <DepositModal />;
    default: return null;
  }
}
