import { Connection, Keypair, Transaction, TransactionInstruction, PublicKey, ComputeBudgetProgram } from "@solana/web3.js";
import { SOLANA_RPC, VAULT_PDA, getGamePda, getHouseAuthority } from "./config";

let _conn: Connection | null = null;
export function getConnection(): Connection {
  if (!_conn) _conn = new Connection(SOLANA_RPC, "confirmed");
  return _conn;
}

export async function sendHouseTx(instructions: TransactionInstruction[]): Promise<string> {
  const conn = getConnection();
  const house = getHouseAuthority();
  const tx = new Transaction();
  tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5000 }));
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }));
  for (const ix of instructions) tx.add(ix);
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = house.publicKey;
  tx.sign(house);
  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
  // Do NOT poll — Vercel functions timeout at 10s. Just return the signature.
  return sig;
}

export async function getVaultBalance(): Promise<number> { return getConnection().getBalance(VAULT_PDA); }
export async function playerGameExists(player: PublicKey): Promise<boolean> { const [g] = getGamePda(player); return (await getConnection().getAccountInfo(g)) !== null; }
