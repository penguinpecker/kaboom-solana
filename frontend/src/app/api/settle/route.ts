import { NextRequest, NextResponse } from "next/server";
import { PublicKey, TransactionInstruction, SystemProgram } from "@solana/web3.js";
import { createHash } from "crypto";
import { PROGRAM_ID, VAULT_PDA, getGamePda, getHouseAuthority } from "@/lib/server/config";
import { sendHouseTx } from "@/lib/server/solana";
import { getGameSession, settleSession } from "@/lib/server/game";
import { buildSettleGame } from "@/lib/server/instructions";

function disc(name: string): Buffer {
  return createHash("sha256").update("global:" + name).digest().subarray(0, 8);
}

export async function POST(req: NextRequest) {
  try {
    const { player, phase } = await req.json();
    if (!player) return NextResponse.json({ error: "Missing player" }, { status: 400 });
    let pk: PublicKey;
    try { pk = new PublicKey(player); } catch { return NextResponse.json({ error: "Invalid pubkey" }, { status: 400 }); }

    const session = getGameSession(player);
    if (!session) return NextResponse.json({ error: "No active session" }, { status: 404 });

    if (phase === "settle") {
      // Phase 2: Server settles with proof (after player cashed out)
      const s = settleSession(player);
      const signature = await sendHouseTx([buildSettleGame(pk, s.mineLayout, s.salt)]);
      return NextResponse.json({ signature, mineLayout: s.mineLayout, verified: true });
    }

    // Phase 1: Return cash_out instruction for player to sign
    const [gamePda] = getGamePda(pk);
    const data = Buffer.alloc(8);
    disc("cash_out").copy(data, 0);
    const instruction = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: VAULT_PDA, isSigner: false, isWritable: true },
        { pubkey: gamePda, isSigner: false, isWritable: true },
        { pubkey: pk, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    });

    return NextResponse.json({
      phase: "cashout",
      instruction: {
        programId: instruction.programId.toBase58(),
        keys: instruction.keys.map(k => ({ pubkey: k.pubkey.toBase58(), isSigner: k.isSigner, isWritable: k.isWritable })),
        data: Buffer.from(instruction.data).toString("base64"),
      },
    });
  } catch (err: any) {
    console.error("Settle/cashout failed:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
