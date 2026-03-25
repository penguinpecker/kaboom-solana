import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { getGamePda } from "@/lib/server/config";
import { getConnection } from "@/lib/server/solana";

export async function GET(_req: NextRequest, { params }: { params: { player: string } }) {
  try {
    const pk = new PublicKey(params.player);
    const [gamePda] = getGamePda(pk);
    const info = await getConnection().getAccountInfo(gamePda);
    if (!info) return NextResponse.json({ active: false });
    return NextResponse.json({ active: true, gamePda: gamePda.toBase58() });
  } catch {
    return NextResponse.json({ active: false });
  }
}
