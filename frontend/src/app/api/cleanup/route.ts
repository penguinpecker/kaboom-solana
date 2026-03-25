import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { getGamePda } from "@/lib/server/config";
import { getConnection } from "@/lib/server/solana";
import { buildRefundExpired, buildCloseGame, serializeIx } from "@/lib/server/instructions";

export async function POST(req: NextRequest) {
  try {
    const { player } = await req.json();
    if (!player) return NextResponse.json({ error: "Missing player" }, { status: 400 });

    let pk: PublicKey;
    try { pk = new PublicKey(player); }
    catch { return NextResponse.json({ error: "Invalid pubkey" }, { status: 400 }); }

    const [gamePda] = getGamePda(pk);
    const info = await getConnection().getAccountInfo(gamePda);
    if (!info) return NextResponse.json({ active: false });

    return NextResponse.json({
      active: true,
      refundInstruction: serializeIx(buildRefundExpired(pk)),
      closeInstruction: serializeIx(buildCloseGame(pk)),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
