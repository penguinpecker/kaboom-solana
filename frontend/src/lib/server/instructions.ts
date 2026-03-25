import { PublicKey, TransactionInstruction, SystemProgram } from "@solana/web3.js";
import { createHash } from "crypto";
import { PROGRAM_ID, VAULT_PDA, getGamePda, getHouseAuthority } from "./config";

function disc(name: string): Buffer {
  return createHash("sha256").update("global:" + name).digest().subarray(0, 8);
}

export function buildStartGameData(player: PublicKey, mineCount: number, betLamports: bigint, commitment: Buffer): { instruction: TransactionInstruction } {
  const [gamePda] = getGamePda(player);
  const data = Buffer.alloc(8 + 1 + 8 + 32);
  disc("start_game").copy(data, 0);
  data.writeUInt8(mineCount, 8);
  data.writeBigUInt64LE(betLamports, 9);
  commitment.copy(data, 17);
  return { instruction: new TransactionInstruction({ programId: PROGRAM_ID, keys: [{ pubkey: VAULT_PDA, isSigner: false, isWritable: true }, { pubkey: gamePda, isSigner: false, isWritable: true }, { pubkey: player, isSigner: true, isWritable: true }, { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }], data }) };
}

export function buildRevealTile(player: PublicKey, tileIndex: number, isMine: boolean): TransactionInstruction {
  const [gamePda] = getGamePda(player);
  const house = getHouseAuthority();
  const data = Buffer.alloc(8 + 1 + 1);
  disc("reveal_tile").copy(data, 0);
  data.writeUInt8(tileIndex, 8);
  data.writeUInt8(isMine ? 1 : 0, 9);
  return new TransactionInstruction({ programId: PROGRAM_ID, keys: [{ pubkey: VAULT_PDA, isSigner: false, isWritable: false }, { pubkey: gamePda, isSigner: false, isWritable: true }, { pubkey: house.publicKey, isSigner: true, isWritable: false }], data });
}

export function buildSettleGame(player: PublicKey, mineLayout: number, salt: Buffer): TransactionInstruction {
  const [gamePda] = getGamePda(player);
  const house = getHouseAuthority();
  const data = Buffer.alloc(8 + 2 + 32);
  disc("settle_game").copy(data, 0);
  data.writeUInt16LE(mineLayout, 8);
  salt.copy(data, 10);
  return new TransactionInstruction({ programId: PROGRAM_ID, keys: [{ pubkey: VAULT_PDA, isSigner: false, isWritable: false }, { pubkey: gamePda, isSigner: false, isWritable: true }, { pubkey: house.publicKey, isSigner: true, isWritable: false }], data });
}

export function buildCashOutData(player: PublicKey): { instruction: TransactionInstruction } {
  const [gamePda] = getGamePda(player);
  const data = Buffer.alloc(8);
  disc("cash_out").copy(data, 0);
  return {
    instruction: new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: VAULT_PDA, isSigner: false, isWritable: true },
        { pubkey: gamePda, isSigner: false, isWritable: true },
        { pubkey: player, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    }),
  };
}
