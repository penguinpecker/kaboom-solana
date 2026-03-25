import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { getGamePda } from "@/lib/server/config";
import { getConnection, sendHouseTx } from "@/lib/server/solana";
import { buildRevealTile, buildSettleGame, buildRefundExpired, buildCloseGame, serializeIx } from "@/lib/server/instructions";
import { decryptSession } from "@/lib/server/session";
import { getSessionSalt } from "@/lib/server/game";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { player, gameToken } = body;

    if (!player) return NextResponse.json({ error: "Missing player" }, { status: 400 });

    let pk: PublicKey;
    try { pk = new PublicKey(player); }
    catch { return NextResponse.json({ error: "Invalid pubkey" }, { status: 400 }); }

    const [gamePda] = getGamePda(pk);
    const conn = getConnection();
    const info = await conn.getAccountInfo(gamePda);
    if (!info) return NextResponse.json({ active: false, message: "No stuck game" });

    // Read game status from account data (offset 42 = 8 disc + 32 player + 1 bump + 1 status)
    const status = info.data[42]; // 0=Playing, 1=Won, 2=Lost, 3=Expired
    // Read settled flag (offset varies, but let's check start_slot for expiry)
    // start_slot at offset: 8+32+1+1+8+1+32+2+2+1+8 = 96
    const startSlot = Number(info.data.readBigUInt64LE(96));
    const currentSlot = await conn.getSlot();
    const isExpired = currentSlot > startSlot + 300;

    console.log("Cleanup: status=" + status + " expired=" + isExpired + " slot=" + currentSlot + " startSlot=" + startSlot);

    // If we have a gameToken and game is still Playing, force-end it server-side
    if (gameToken && status === 0) {
      try {
        const session = decryptSession(gameToken);
        // Find an unrevealed tile that IS a mine
        let mineIdx = -1;
        for (let i = 0; i < 16; i++) {
          if (!session.reveals.includes(i) && (session.mineLayout & (1 << i)) !== 0) {
            mineIdx = i;
            break;
          }
        }
        if (mineIdx >= 0) {
          // Reveal mine → game becomes Lost
          const revealIx = buildRevealTile(pk, mineIdx, true);
          await sendHouseTx([revealIx]);
          // Settle with proof
          const salt = getSessionSalt(session);
          const settleIx = buildSettleGame(pk, session.mineLayout, salt);
          await sendHouseTx([settleIx]);
          // Now return close_game for player to sign
          const closeIx = buildCloseGame(pk);
          return NextResponse.json({ active: true, action: "close", instruction: serializeIx(closeIx) });
        }
      } catch (e: any) {
        console.error("Force-end failed:", e.message?.slice(0, 100));
      }
    }

    // If game is settled (Won/Lost + settled), just need close
    // settled flag at offset: 8+32+1+1+8+1+32+2+2+1+8+8+8 = 112, 1 byte
    const settled = info.data[112] === 1;
    if ((status === 1 || status === 2) && settled) {
      const closeIx = buildCloseGame(pk);
      return NextResponse.json({ active: true, action: "close", instruction: serializeIx(closeIx) });
    }

    // If expired, return refund + close
    if (isExpired && status === 0) {
      const refundIx = buildRefundExpired(pk);
      const closeIx = buildCloseGame(pk);
      return NextResponse.json({
        active: true,
        action: "refund_and_close",
        refundInstruction: serializeIx(refundIx),
        closeInstruction: serializeIx(closeIx),
      });
    }

    // Game is Playing + not expired + no token → must wait
    const slotsLeft = (startSlot + 300) - currentSlot;
    const secondsLeft = Math.max(1, Math.ceil(slotsLeft * 0.4));
    return NextResponse.json({
      active: true,
      action: "wait",
      message: "Game in progress. Wait " + secondsLeft + "s for expiry, then retry.",
      secondsLeft,
    });
  } catch (err: any) {
    console.error("Cleanup error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
