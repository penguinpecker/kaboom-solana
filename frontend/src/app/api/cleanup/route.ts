import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { createHash } from "crypto";
import { PROGRAM_ID, VAULT_PDA, getGamePda } from "@/lib/server/config";
import { getConnection } from "@/lib/server/solana";
import { removeSession } from "@/lib/server/game";

function discriminator(name: string): Buffer {
  return createHash("sha256").update("global:" + name).digest().subarray(0, 8);
}

export async function POST(req: NextRequest) {
  try {
    const { player } = await req.json();
    if (!player) return NextResponse.json({ error: "Missing player" }, { status: 400 });
    let playerPubkey: PublicKey;
    try { playerPubkey = new PublicKey(player); } catch { return NextResponse.json({ error: "Invalid pubkey" }, { status: 400 }); }
    const [gamePda] = getGamePda(playerPubkey);
    const info = await getConnection().getAccountInfo(gamePda);
    if (!info) return NextResponse.json({ active: false });
    const refundIx = { programId: PROGRAM_ID.toBase58(), keys: [{ pubkey: VAULT_PDA.toBase58(), isSigner: false, isWritable: true }, { pubkey: gamePda.toBase58(), isSigner: false, isWritable: true }, { pubkey: player, isSigner: true, isWritable: true }], data: Buffer.from(discriminator("refund_expired")).toString("base64") };
    const closeIx = { programId: PROGRAM_ID.toBase58(), keys: [{ pubkey: gamePda.toBase58(), isSigner: false, isWritable: true }, { pubkey: player, isSigner: true, isWritable: true }], data: Buffer.from(discriminator("close_game")).toString("base64") };
    try { removeSession(player); } catch {}
    return NextResponse.json({ active: true, gamePda: gamePda.toBase58(), refundInstruction: refundIx, closeInstruction: closeIx });
  } catch (err: any) { return NextResponse.json({ error: err.message }, { status: 500 }); }
}
