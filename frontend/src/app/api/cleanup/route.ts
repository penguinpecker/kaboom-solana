import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { getGamePda } from "@/lib/server/config";
import { getConnection, sendHouseTx } from "@/lib/server/solana";
import { buildSettleGame, buildCloseGame, buildRefundExpired, serializeIx } from "@/lib/server/instructions";
import { decryptSession } from "@/lib/server/session";
import { getSessionSalt } from "@/lib/server/game";

export async function POST(req: NextRequest) {
  try {
    const { player, gameToken } = await req.json();
    if (!player) return NextResponse.json({ error: "Missing player" }, { status: 400 });

    let pk: PublicKey;
    try { pk = new PublicKey(player); }
    catch { return NextResponse.json({ error: "Invalid pubkey" }, { status: 400 }); }

    const [gamePda] = getGamePda(pk);
    const info = await getConnection().getAccountInfo(gamePda);
    if (!info) return NextResponse.json({ active: false });

    // If we have gameToken, try to settle (fire-and-forget, no polling)
    if (gameToken) {
      try {
        const session = decryptSession(gameToken);
        const salt = getSessionSalt(session);
        await sendHouseTx([buildSettleGame(pk, session.mineLayout, salt)]);
        // Wait for tx to land (sendHouseTx returns immediately now)
        await new Promise(r => setTimeout(r, 3000));
      } catch (e: any) {
        console.log("Settle:", (e.message || "").slice(0, 80));
      }
    }

    return NextResponse.json({
      active: true,
      closeInstruction: serializeIx(buildCloseGame(pk)),
      refundInstruction: serializeIx(buildRefundExpired(pk)),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
