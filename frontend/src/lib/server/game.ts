import { randomBytes, createHash } from "crypto";
import type { SessionData } from "./session";

const GRID_SIZE = 16;
const MIN_MINES = 1;
const MAX_MINES = 12;

export { GRID_SIZE, MIN_MINES, MAX_MINES };

function generateMineLayout(mineCount: number): number {
  const tiles: number[] = [];
  for (let i = 0; i < GRID_SIZE; i++) tiles.push(i);
  for (let i = tiles.length - 1; i > 0; i--) {
    const maxVal = 256 - (256 % (i + 1));
    let rand: number;
    do { rand = randomBytes(1)[0]!; } while (rand >= maxVal);
    const j = rand % (i + 1);
    [tiles[i], tiles[j]] = [tiles[j]!, tiles[i]!];
  }
  let layout = 0;
  for (let k = 0; k < mineCount; k++) {
    layout |= 1 << tiles[tiles.length - 1 - k]!;
  }
  return layout;
}

function computeCommitment(mineLayout: number, mineCount: number, salt: Buffer): Buffer {
  const layoutBytes = Buffer.alloc(2);
  layoutBytes.writeUInt16LE(mineLayout);
  return createHash("sha256").update(Buffer.concat([layoutBytes, Buffer.from([mineCount]), salt])).digest();
}

export function createSession(player: string, mineCount: number): { session: SessionData; commitment: Buffer } {
  if (mineCount < MIN_MINES || mineCount > MAX_MINES) throw new Error("Invalid mine count");
  const mineLayout = generateMineLayout(mineCount);
  const salt = randomBytes(32);
  const commitment = computeCommitment(mineLayout, mineCount, salt);
  const session: SessionData = {
    player,
    mineCount,
    mineLayout,
    salt: salt.toString("hex"),
    commitment: commitment.toString("hex"),
    reveals: [],
    createdAt: Date.now(),
  };
  return { session, commitment };
}

export function checkTile(session: SessionData, tileIndex: number): { isMine: boolean; updatedSession: SessionData } {
  if (tileIndex < 0 || tileIndex >= GRID_SIZE) throw new Error("Invalid tile index");
  if (session.reveals.includes(tileIndex)) throw new Error("Tile already revealed");
  const isMine = (session.mineLayout & (1 << tileIndex)) !== 0;
  return {
    isMine,
    updatedSession: { ...session, reveals: [...session.reveals, tileIndex] },
  };
}

export function getSessionSalt(session: SessionData): Buffer {
  return Buffer.from(session.salt, "hex");
}
