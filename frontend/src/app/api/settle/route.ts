import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { getSessionSalt } from "@/lib/server/game";
import { sendHouseTx } from "@/lib/server/solana";
import { buildCashOut, buildSettleGame, serializeIx } from "@/lib/server/instructions";
import { decryptSession } from "@/lib/server/session";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { player, gameToken, phase } = body;

    if (!player || !gameToken) {
      return NextResponse.json({ error: "Missing player or gameToken" }, { status: 400 });
    }

    let pk: PublicKey;
    try { pk = new PublicKey(player); }
    catch { return NextResponse.json({ error: "Invalid player pubkey" }, { status: 400 }); }

    let session;
    try { session = decryptSession(gameToken); }
    catch { return NextResponse.json({ error: "Invalid game token" }, { status: 400 }); }

    if (session.player !== player) {
      return NextResponse.json({ error: "Token player mismatch" }, { status: 403 });
    }

    if (phase === "settle") {
      // Phase 2: Server settles with proof
      const salt = getSessionSalt(session);
      const settleIx = buildSettleGame(pk, session.mineLayout, salt);
      const signature = await sendHouseTx([settleIx]);
      return NextResponse.json({ signature, mineLayout: session.mineLayout, verified: true });
    }

    // Phase 1: Return cash_out instruction for player to sign
    const cashIx = buildCashOut(pk);
    return NextResponse.json({
      phase: "cashout",
      instruction: serializeIx(cashIx),
    });
  } catch (err: any) {
    console.error("Settle error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
