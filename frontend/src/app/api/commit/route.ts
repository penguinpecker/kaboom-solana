import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { MIN_MINES, MAX_MINES } from "@/lib/server/config";
import { playerGameExists } from "@/lib/server/solana";
import { createGameSession } from "@/lib/server/game";
import { buildStartGameData } from "@/lib/server/instructions";

export async function POST(req: NextRequest) {
  try {
    const { player, mineCount, betLamports } = await req.json();
    if (!player || !mineCount || !betLamports) return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    let pk: PublicKey;
    try { pk = new PublicKey(player); } catch { return NextResponse.json({ error: "Invalid pubkey" }, { status: 400 }); }
    const mc = Number(mineCount);
    if (mc < MIN_MINES || mc > MAX_MINES) return NextResponse.json({ error: "Invalid mine count" }, { status: 400 });
    if (BigInt(betLamports) < 1_000_000n) return NextResponse.json({ error: "Min bet 0.001 SOL" }, { status: 400 });
    if (await playerGameExists(pk)) return NextResponse.json({ error: "Active game exists. Close it first.", needsCleanup: true }, { status: 409 });
    const { commitment } = createGameSession(player, mc, 16);
    const { instruction } = buildStartGameData(pk, mc, BigInt(betLamports), commitment);
    return NextResponse.json({
      commitment: commitment.toString("hex"),
      instruction: { programId: instruction.programId.toBase58(), keys: instruction.keys.map(k => ({ pubkey: k.pubkey.toBase58(), isSigner: k.isSigner, isWritable: k.isWritable })), data: Buffer.from(instruction.data).toString("base64") },
    });
  } catch (err: any) { return NextResponse.json({ error: err.message }, { status: 500 }); }
}
