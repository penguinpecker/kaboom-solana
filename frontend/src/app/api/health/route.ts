import { NextResponse } from "next/server";
import { PROGRAM_ID, VAULT_PDA, getHouseAuthority } from "@/lib/server/config";
import { getVaultBalance } from "@/lib/server/solana";
import { getActiveGameCount } from "@/lib/server/game";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

export async function GET() {
  try {
    const balance = await getVaultBalance();
    return NextResponse.json({ status: "ok", programId: PROGRAM_ID.toBase58(), vaultPda: VAULT_PDA.toBase58(), vaultBalance: balance / LAMPORTS_PER_SOL, houseAuthority: getHouseAuthority().publicKey.toBase58(), activeGames: getActiveGameCount(), timestamp: Date.now() });
  } catch (err: any) { return NextResponse.json({ error: err.message }, { status: 500 }); }
}
