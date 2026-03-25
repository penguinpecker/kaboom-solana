import {
  Connection, Keypair, Transaction, TransactionInstruction,
  ComputeBudgetProgram,
  PublicKey,
} from "@solana/web3.js";
import { serverConfig } from "./config.js";

let _conn: Connection | null = null;
function getConnection(): Connection {
  if (!_conn) _conn = new Connection(serverConfig.rpc, "confirmed");
  return _conn;
}

async function confirmTxPolling(conn: Connection, sig: string, timeoutMs = 30000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const s = await conn.getSignatureStatus(sig);
      if (s?.value?.confirmationStatus === "confirmed" || s?.value?.confirmationStatus === "finalized") {
        if (s.value.err) throw new Error("Tx failed: " + JSON.stringify(s.value.err));
        return;
      }
    } catch (e: any) {
      if (e.message?.includes("Tx failed")) throw e;
    }
    await new Promise(r => setTimeout(r, 1500));
  }
  console.warn("Tx confirmation timeout: " + sig);
}

export async function sendHouseTx(instructions: TransactionInstruction[]): Promise<string> {
  const conn = getConnection();
  const tx = new Transaction();
  tx.add(
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5000 }),
    ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 })
  );
  for (const ix of instructions) tx.add(ix);
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = serverConfig.houseAuthority.publicKey;
  tx.sign(serverConfig.houseAuthority);

  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 2 });
  console.log("Tx sent:", sig);
  try { await confirmTxPolling(conn, sig); } catch (e: any) { console.warn("Confirm issue:", e.message); }
  return sig;
}

export async function getVaultBalance(): Promise<number> {
  return getConnection().getBalance(serverConfig.VAULT_PDA);
}

export async function playerGameExists(player: PublicKey): Promise<boolean> {
  const [gamePda] = serverConfig.getGamePda(player);
  const info = await getConnection().getAccountInfo(gamePda);
  return info !== null;
}

export async function getGameAccountInfo(player: PublicKey) {
  const [gamePda] = serverConfig.getGamePda(player);
  return getConnection().getAccountInfo(gamePda);
}
