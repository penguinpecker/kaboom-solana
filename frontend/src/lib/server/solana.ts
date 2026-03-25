import { Connection, Keypair, Transaction, TransactionInstruction, PublicKey, ComputeBudgetProgram } from "@solana/web3.js";
import { SOLANA_RPC, VAULT_PDA, getGamePda, getHouseAuthority } from "./config";

let _connection: Connection | null = null;
export function getConnection(): Connection {
  if (!_connection) _connection = new Connection(SOLANA_RPC, "confirmed");
  return _connection;
}

async function confirmTxPolling(conn: Connection, sig: string, timeoutMs = 30000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const status = await conn.getSignatureStatus(sig);
      if (status?.value?.confirmationStatus === "confirmed" || status?.value?.confirmationStatus === "finalized") {
        if (status.value.err) throw new Error("Tx failed: " + JSON.stringify(status.value.err));
        return;
      }
    } catch (e: any) { if (e.message?.includes("Tx failed")) throw e; }
    await new Promise(r => setTimeout(r, 1500));
  }
}

export async function sendHouseTx(instructions: TransactionInstruction[]): Promise<string> {
  const conn = getConnection();
  const house = getHouseAuthority();
  const tx = new Transaction();
  tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5000 }), ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }));
  for (const ix of instructions) tx.add(ix);
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = house.publicKey;
  tx.sign(house);
  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 2 });
  try { await confirmTxPolling(conn, sig); } catch {}
  return sig;
}

export async function getVaultBalance(): Promise<number> { return getConnection().getBalance(VAULT_PDA); }
export async function playerGameExists(player: PublicKey): Promise<boolean> { const [g] = getGamePda(player); return (await getConnection().getAccountInfo(g)) !== null; }
