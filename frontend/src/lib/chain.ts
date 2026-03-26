import { PublicKey } from "@solana/web3.js";

export const SOLANA_RPC = process.env.NEXT_PUBLIC_SOLANA_RPC || "https://api.devnet.solana.com";
export const EXPLORER = "https://solscan.io";
export const PROGRAM_ID = new PublicKey("Gw7rMAw65i3vZXrZjfbTgCe1uRjQw5VtY5Qc6Ksxrwc4");

const VAULT_SEED = Buffer.from("kaboom_vault_v2");
const GAME_SEED = Buffer.from("kaboom_game_v2");

export const GAME_CONFIG = {
  GRID_SIZE: 16, GRID_COLS: 4, HOUSE_EDGE: 0.02,
  MIN_MINES: 1, MAX_MINES: 12,
  MINE_OPTIONS: [1, 3, 5, 8, 10, 12] as const,
  MAX_BET_PERCENT: 0.02, MAX_PAYOUT_PERCENT: 0.10,
  MIN_BET_SOL: 0.001, BPS_DENOMINATOR: 10_000,
  GAME_EXPIRY_SLOTS: 300,
} as const;

export const [VAULT_PDA] = PublicKey.findProgramAddressSync([VAULT_SEED], PROGRAM_ID);

export const CONTRACTS: Record<string, string> = {
  KaboomProgram: PROGRAM_ID.toBase58(),
  Vault: VAULT_PDA.toBase58(),
};

export function getGamePda(player: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([GAME_SEED, player.toBuffer()], PROGRAM_ID);
}

export function getPlayerStatsPda(player: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("stats"), player.toBuffer()], PROGRAM_ID);
}

export const HOUSE_SERVER = process.env.NEXT_PUBLIC_HOUSE_SERVER || "http://localhost:3001";
