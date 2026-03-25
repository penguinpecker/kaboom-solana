import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { sendHouseTx } from "@/lib/server/solana";
import { getGameSession, settleSession } from "@/lib/server/game";
import { buildSettleGame } from "@/lib/server/instructions";

export async function POST(req: NextRequest) {
  try {
    const { player } = await req.json();
    if (!player) return NextResponse.json({ error: "Missing player" }, { status: 400 });
    let pk: PublicKey;
    try { pk = new PublicKey(player); } catch { return NextResponse.json({ error: "Invalid pubkey" }, { status: 400 }); }
    const session = getGameSession(player);
    if (!session) return NextResponse.json({ error: "No active session" }, { status: 404 });
    const s = settleSession(player);
    const signature = await sendHouseTx([buildSettleGame(pk, s.mineLayout, s.salt)]);
    return NextResponse.json({ signature, mineLayout: s.mineLayout, salt: s.salt.toString("hex"), commitment: s.commitment.toString("hex"), verified: true });
  } catch (err: any) { return NextResponse.json({ error: err.message }, { status: 500 }); }
}
