// Compatibility layer so pages can use the same API as the Somnia version
// without rewriting every page from scratch

import { useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

/**
 * Drop-in replacement for viem's formatEther
 * Works with both bigint (lamports) and number
 */
export function formatEther(value: bigint | number | undefined): string {
  if (value === undefined || value === null) return "0";
  const num = typeof value === "bigint" ? Number(value) : value;
  return (num / LAMPORTS_PER_SOL).toString();
}

/**
 * Drop-in replacement for wagmi's useAccount
 */
export function useAccount() {
  const { publicKey, connected } = useWallet();
  return {
    address: publicKey?.toBase58() as `0x${string}` | undefined,
    isConnected: connected,
  };
}

/**
 * Drop-in replacement for wagmi's useBalance
 * Note: actual balance fetching happens in components that need it
 */
export function useBalance({ address }: { address?: string }) {
  // Stub — balance is fetched directly in components via connection.getBalance
  return { data: undefined };
}
