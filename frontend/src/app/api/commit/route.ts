import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { createSession, MIN_MINES, MAX_MINES } from "@/lib/server/game";
import { playerGameExists } from "@/lib/server/solana";
import { buildStartGame, serializeIx } from "@/lib/server/instructions";
import { encryptSession } from "@/lib/server/session";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { player, mineCount, betLamports } = body;
    if (!player || mineCount === undefined || !betLamports) {
      return NextResponse.json({ error: "Missing player, mineCount, or betLamports" }, { status: 400 });
    }

    let pk: PublicKey;
    try { pk = new PublicKey(player); }
    catch { return NextResponse.json({ error: "Invalid player pubkey" }, { status: 400 }); }

    const mc = Number(mineCount);
    if (mc < MIN_MINES || mc > MAX_MINES) {
      return NextResponse.json({ error: "Mine count must be " + MIN_MINES + "-" + MAX_MINES }, { status: 400 });
    }
    if (BigInt(betLamports) < 1_000_000n) {
      return NextResponse.json({ error: "Min bet 0.001 SOL" }, { status: 400 });
    }

    const hasGame = await playerGameExists(pk);
    if (hasGame) {
      return NextResponse.json({ error: "Active game exists. Close it first.", needsCleanup: true }, { status: 409 });
    }

    const { session, commitment } = createSession(player, mc);
    const ix = buildStartGame(pk, mc, BigInt(betLamports), commitment);
    const gameToken = encryptSession(session);

    return NextResponse.json({
      commitment: commitment.toString("hex"),
      instruction: serializeIx(ix),
      gameToken,
    });
  } catch (err: any) {
    console.error("Commit error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
