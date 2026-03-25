import { PublicKey, TransactionInstruction, SystemProgram } from "@solana/web3.js";
import { createHash } from "crypto";
import { PROGRAM_ID, VAULT_PDA, getGamePda, getHouseAuthority } from "./config";

function disc(name: string): Buffer {
  return createHash("sha256").update("global:" + name).digest().subarray(0, 8);
}

export function buildStartGame(player: PublicKey, mineCount: number, betLamports: bigint, commitment: Buffer): TransactionInstruction {
  const [gamePda] = getGamePda(player);
  const data = Buffer.alloc(8 + 1 + 8 + 32);
  disc("start_game").copy(data, 0);
  data.writeUInt8(mineCount, 8);
  data.writeBigUInt64LE(betLamports, 9);
  commitment.copy(data, 17);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: VAULT_PDA, isSigner: false, isWritable: true },
      { pubkey: gamePda, isSigner: false, isWritable: true },
      { pubkey: player, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export function buildRevealTile(player: PublicKey, tileIndex: number, isMine: boolean): TransactionInstruction {
  const [gamePda] = getGamePda(player);
  const house = getHouseAuthority();
  const data = Buffer.alloc(8 + 1 + 1);
  disc("reveal_tile").copy(data, 0);
  data.writeUInt8(tileIndex, 8);
  data.writeUInt8(isMine ? 1 : 0, 9);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: VAULT_PDA, isSigner: false, isWritable: false },
      { pubkey: gamePda, isSigner: false, isWritable: true },
      { pubkey: house.publicKey, isSigner: true, isWritable: false },
    ],
    data,
  });
}

export function buildSettleGame(player: PublicKey, mineLayout: number, salt: Buffer): TransactionInstruction {
  const [gamePda] = getGamePda(player);
  const house = getHouseAuthority();
  const data = Buffer.alloc(8 + 2 + 32);
  disc("settle_game").copy(data, 0);
  data.writeUInt16LE(mineLayout, 8);
  salt.copy(data, 10);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: VAULT_PDA, isSigner: false, isWritable: false },
      { pubkey: gamePda, isSigner: false, isWritable: true },
      { pubkey: house.publicKey, isSigner: true, isWritable: false },
    ],
    data,
  });
}

export function buildCashOut(player: PublicKey): TransactionInstruction {
  const [gamePda] = getGamePda(player);
  const data = Buffer.alloc(8);
  disc("cash_out").copy(data, 0);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: VAULT_PDA, isSigner: false, isWritable: true },
      { pubkey: gamePda, isSigner: false, isWritable: true },
      { pubkey: player, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export function serializeIx(ix: TransactionInstruction): object {
  return {
    programId: ix.programId.toBase58(),
    keys: ix.keys.map(k => ({ pubkey: k.pubkey.toBase58(), isSigner: k.isSigner, isWritable: k.isWritable })),
    data: Buffer.from(ix.data).toString("base64"),
  };
}

export function buildRefundExpired(player: PublicKey): TransactionInstruction {
  const [gamePda] = getGamePda(player);
  const data = Buffer.alloc(8);
  disc("refund_expired").copy(data, 0);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: VAULT_PDA, isSigner: false, isWritable: true },
      { pubkey: gamePda, isSigner: false, isWritable: true },
      { pubkey: player, isSigner: true, isWritable: true },
    ],
    data,
  });
}

export function buildCloseGame(player: PublicKey): TransactionInstruction {
  const [gamePda] = getGamePda(player);
  const data = Buffer.alloc(8);
  disc("close_game").copy(data, 0);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: gamePda, isSigner: false, isWritable: true },
      { pubkey: player, isSigner: true, isWritable: true },
    ],
    data,
  });
}
