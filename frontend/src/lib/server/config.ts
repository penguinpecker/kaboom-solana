import { PublicKey, Keypair } from "@solana/web3.js";

let _houseAuthority: Keypair | null = null;
export function getHouseAuthority(): Keypair {
  if (!_houseAuthority) {
    const raw = process.env.HOUSE_AUTHORITY_KEY;
    if (!raw) throw new Error("Missing HOUSE_AUTHORITY_KEY");
    _houseAuthority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
  }
  return _houseAuthority;
}

export const PROGRAM_ID = new PublicKey(
  process.env.PROGRAM_ID || "2EaLenCErRF3oKnDB1X6zFzo489JHKBMkFPoSRFcYYr7"
);

export const SOLANA_RPC = process.env.SOLANA_RPC || "https://api.devnet.solana.com";

export const VAULT_SEED = Buffer.from("kaboom_vault_v2");
export const GAME_SEED = Buffer.from("kaboom_game_v2");
export const GRID_SIZE = 16;
export const MIN_MINES = 1;
export const MAX_MINES = 12;

export const [VAULT_PDA] = PublicKey.findProgramAddressSync([VAULT_SEED], PROGRAM_ID);

export function getGamePda(player: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([GAME_SEED, player.toBuffer()], PROGRAM_ID);
}
