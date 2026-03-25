import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { checkTile, getSessionSalt, GRID_SIZE } from "@/lib/server/game";
import { sendHouseTx } from "@/lib/server/solana";
import { buildRevealTile, buildSettleGame } from "@/lib/server/instructions";
import { decryptSession, encryptSession } from "@/lib/server/session";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { player, tileIndex, gameToken } = body;

    if (!player || tileIndex === undefined || !gameToken) {
      return NextResponse.json({ error: "Missing player, tileIndex, or gameToken" }, { status: 400 });
    }

    let pk: PublicKey;
    try { pk = new PublicKey(player); }
    catch { return NextResponse.json({ error: "Invalid player pubkey" }, { status: 400 }); }

    const idx = Number(tileIndex);
    if (idx < 0 || idx >= GRID_SIZE) {
      return NextResponse.json({ error: "Invalid tile index" }, { status: 400 });
    }

    // Decrypt session from token
    let session;
    try { session = decryptSession(gameToken); }
    catch { return NextResponse.json({ error: "Invalid or expired game token" }, { status: 400 }); }

    // Verify player matches
    if (session.player !== player) {
      return NextResponse.json({ error: "Token player mismatch" }, { status: 403 });
    }

    // Check tile against mine layout
    const { isMine, updatedSession } = checkTile(session, idx);

    // Send reveal_tile on-chain (house authority signs)
    const revealIx = buildRevealTile(pk, idx, isMine);
    const signature = await sendHouseTx([revealIx]);

    // If mine hit, auto-settle on-chain
    let settleSig: string | undefined;
    if (isMine) {
      try {
        const salt = getSessionSalt(updatedSession);
        const settleIx = buildSettleGame(pk, updatedSession.mineLayout, salt);
        settleSig = await sendHouseTx([settleIx]);
      } catch (e: any) {
        console.error("Auto-settle failed:", e.message);
      }
    }

    // Re-encrypt updated session
    const newToken = encryptSession(updatedSession);

    // Count safe reveals
    const safeReveals = updatedSession.reveals.filter(
      t => (updatedSession.mineLayout & (1 << t)) === 0
    ).length;

    return NextResponse.json({
      isMine,
      tileIndex: idx,
      signature,
      settleSig,
      safeReveals,
      gameToken: newToken,
    });
  } catch (err: any) {
    console.error("Reveal error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
