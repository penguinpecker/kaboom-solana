import { PublicKey, Keypair } from "@solana/web3.js";

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing env var: ${key}`);
  return val;
}

function parseKeypair(envKey: string): Keypair {
  const raw = requireEnv(envKey);
  try {
    const arr = JSON.parse(raw);
    return Keypair.fromSecretKey(Uint8Array.from(arr));
  } catch {
    throw new Error(`Invalid keypair in ${envKey}`);
  }
}

const programId = new PublicKey(requireEnv("PROGRAM_ID"));
const houseAuthority = parseKeypair("HOUSE_AUTHORITY_KEY");
const rpc = requireEnv("SOLANA_RPC");

const [VAULT_PDA] = PublicKey.findProgramAddressSync(
  [Buffer.from("kaboom_vault_v2")],
  programId
);

function getGamePda(player: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("kaboom_game_v2"), player.toBuffer()],
    programId
  );
}

export const serverConfig = {
  programId,
  houseAuthority,
  rpc,
  VAULT_PDA,
  getGamePda,
  gridSize: 16,
  minMines: 1,
  maxMines: 12,
};
