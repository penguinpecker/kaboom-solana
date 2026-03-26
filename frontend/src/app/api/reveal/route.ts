import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { checkTile, getSessionSalt, GRID_SIZE } from "@/lib/server/game";
import { sendHouseTx } from "@/lib/server/solana";
import { buildRevealTile, buildSettleGame, buildCloseGame, serializeIx } from "@/lib/server/instructions";
import { decryptSession, encryptSession } from "@/lib/server/session";

export async function POST(req: NextRequest) {
  try {
    const { player, tileIndex, gameToken } = await req.json();
    if (!player || tileIndex === undefined || !gameToken) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    let pk: PublicKey;
    try { pk = new PublicKey(player); }
    catch { return NextResponse.json({ error: "Invalid pubkey" }, { status: 400 }); }

    const idx = Number(tileIndex);
    if (idx < 0 || idx >= GRID_SIZE) {
      return NextResponse.json({ error: "Invalid tile" }, { status: 400 });
    }

    let session;
    try { session = decryptSession(gameToken); }
    catch { return NextResponse.json({ error: "Invalid game token" }, { status: 400 }); }

    if (session.player !== player) {
      return NextResponse.json({ error: "Player mismatch" }, { status: 403 });
    }

    const { isMine, updatedSession } = checkTile(session, idx);
    const revealIx = buildRevealTile(pk, idx, isMine);

    let signature: string;
    let closeInstruction: object | undefined;

    if (isMine) {
      // ATOMIC: reveal + settle in ONE transaction
      const salt = getSessionSalt(updatedSession);
      const settleIx = buildSettleGame(pk, updatedSession.mineLayout, salt);
      signature = await sendHouseTx([revealIx, settleIx]);
      // Return close instruction for player to sign (reclaim rent)
      closeInstruction = serializeIx(buildCloseGame(pk));
    } else {
      signature = await sendHouseTx([revealIx]);
    }

    const safeReveals = updatedSession.reveals.filter(
      t => (updatedSession.mineLayout & (1 << t)) === 0
    ).length;

    return NextResponse.json({
      isMine,
      tileIndex: idx,
      signature,
      safeReveals,
      gameToken: encryptSession(updatedSession),
      closeInstruction,
    });
  } catch (err: any) {
    console.error("Reveal error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
