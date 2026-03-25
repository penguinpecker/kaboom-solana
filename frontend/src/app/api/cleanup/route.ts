import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { getGamePda } from "@/lib/server/config";
import { getConnection, sendHouseTx } from "@/lib/server/solana";
import { buildRefundExpired, buildCloseGame, serializeIx } from "@/lib/server/instructions";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { player } = body;
    if (!player) return NextResponse.json({ error: "Missing player" }, { status: 400 });

    let pk: PublicKey;
    try { pk = new PublicKey(player); }
    catch { return NextResponse.json({ error: "Invalid pubkey" }, { status: 400 }); }

    const [gamePda] = getGamePda(pk);
    const conn = getConnection();
    const info = await conn.getAccountInfo(gamePda);
    if (!info) return NextResponse.json({ active: false, message: "No stuck game" });

    // Don't try to read raw bytes — just return both instructions.
    // Client tries refund first, then close. Solana rejects what doesn't apply.
    const refundIx = buildRefundExpired(pk);
    const closeIx = buildCloseGame(pk);

    return NextResponse.json({
      active: true,
      action: "refund_and_close",
      refundInstruction: serializeIx(refundIx),
      closeInstruction: serializeIx(closeIx),
    });
  } catch (err: any) {
    console.error("Cleanup error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
