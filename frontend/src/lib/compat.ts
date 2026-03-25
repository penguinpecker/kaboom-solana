import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { usePrivy } from "@privy-io/react-auth";
import { useWallets, useCreateWallet } from "@privy-io/react-auth/solana";
import { useConnection } from "@solana/wallet-adapter-react";
import { useState, useEffect } from "react";

/**
 * Format lamports to SOL string (drop-in for wagmi's formatEther)
 */
export function formatEther(value: bigint | number | undefined): string {
  if (value === undefined) return "0";
  return (Number(value) / LAMPORTS_PER_SOL).toString();
}

/**
 * Drop-in replacement for wagmi's useAccount — now uses Privy
 */
export function useAccount() {
  const { authenticated } = usePrivy();
  const { wallets } = useWallets();
  const wallet = wallets[0];
  return {
    address: wallet?.address || undefined,
    isConnected: authenticated && !!wallet,
  };
}

/**
 * Drop-in replacement for wagmi's useBalance
 */
export function useBalance({ address }: { address?: string }) {
  const { connection } = useConnection();
  const [data, setData] = useState<{ value: bigint; formatted: string } | undefined>();

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    (async () => {
      try {
        const { PublicKey } = await import("@solana/web3.js");
        const balance = await connection.getBalance(new PublicKey(address));
        if (!cancelled) {
          setData({
            value: BigInt(balance),
            formatted: (balance / LAMPORTS_PER_SOL).toFixed(4),
          });
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [address, connection]);

  return { data };
}
