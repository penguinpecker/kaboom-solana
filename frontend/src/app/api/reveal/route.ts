import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { GRID_SIZE } from "@/lib/server/config";
import { sendHouseTx } from "@/lib/server/solana";
import { checkTile, settleSession } from "@/lib/server/game";
import { buildRevealTile, buildSettleGame } from "@/lib/server/instructions";

export async function POST(req: NextRequest) {
  try {
    const { player, tileIndex } = await req.json();
    if (!player || tileIndex === undefined) return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    let pk: PublicKey;
    try { pk = new PublicKey(player); } catch { return NextResponse.json({ error: "Invalid pubkey" }, { status: 400 }); }
    const idx = Number(tileIndex);
    if (idx < 0 || idx >= GRID_SIZE) return NextResponse.json({ error: "Invalid tile" }, { status: 400 });
    const { isMine, session } = checkTile(player, idx, 16);
    const ix = buildRevealTile(pk, idx, isMine);
    const signature = await sendHouseTx([ix]);
    let settleSig: string | undefined;
    if (isMine) { try { const s = settleSession(player); settleSig = await sendHouseTx([buildSettleGame(pk, s.mineLayout, s.salt)]); } catch {} }
    return NextResponse.json({ isMine, tileIndex: idx, signature, settleSig, safeReveals: isMine ? session.reveals.size - 1 : Array.from(session.reveals).filter(t => (session.mineLayout & (1 << t)) === 0).length });
  } catch (err: any) { return NextResponse.json({ error: err.message }, { status: 500 }); }
}
