import { NextRequest, NextResponse } from "next/server";
import { getGameSession } from "@/lib/server/game";

export async function GET(_req: NextRequest, { params }: { params: { player: string } }) {
  const session = getGameSession(params.player);
  if (!session) return NextResponse.json({ active: false });
  return NextResponse.json({ active: true, mineCount: session.mineCount, reveals: Array.from(session.reveals), commitment: session.commitment.toString("hex"), createdAt: session.createdAt });
}
