import { randomBytes, createHash } from "crypto";

export interface GameSession {
  player: string;
  mineCount: number;
  mineLayout: number;
  salt: Buffer;
  commitment: Buffer;
  createdAt: number;
  reveals: Set<number>;
  settled: boolean;
}

// In-memory store — persists across warm invocations on same Vercel instance
const activeGames = new Map<string, GameSession>();

function generateMineLayout(mineCount: number, gridSize: number): number {
  const tiles: number[] = [];
  for (let i = 0; i < gridSize; i++) tiles.push(i);
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
  const preimage = Buffer.concat([layoutBytes, Buffer.from([mineCount]), salt]);
  return createHash("sha256").update(preimage).digest();
}

export function createGameSession(player: string, mineCount: number, gridSize: number): { commitment: Buffer; session: GameSession } {
  if (activeGames.has(player)) throw new Error("Player already has an active game session.");
  const mineLayout = generateMineLayout(mineCount, gridSize);
  const salt = randomBytes(32);
  const commitment = computeCommitment(mineLayout, mineCount, salt);
  const session: GameSession = { player, mineCount, mineLayout, salt, commitment, createdAt: Date.now(), reveals: new Set(), settled: false };
  activeGames.set(player, session);
  return { commitment, session };
}

export function getGameSession(player: string): GameSession | undefined {
  return activeGames.get(player);
}

export function checkTile(player: string, tileIndex: number, gridSize: number): { isMine: boolean; session: GameSession } {
  const session = activeGames.get(player);
  if (!session) throw new Error("No active game for player");
  if (session.settled) throw new Error("Game already settled");
  if (tileIndex < 0 || tileIndex >= gridSize) throw new Error("Invalid tile index");
  if (session.reveals.has(tileIndex)) throw new Error("Tile already revealed");
  const isMine = (session.mineLayout & (1 << tileIndex)) !== 0;
  session.reveals.add(tileIndex);
  return { isMine, session };
}

export function settleSession(player: string): GameSession {
  const session = activeGames.get(player);
  if (!session) throw new Error("No active game for player");
  session.settled = true;
  activeGames.delete(player);
  return session;
}

export function removeSession(player: string): void {
  activeGames.delete(player);
}

export function getActiveGameCount(): number {
  return activeGames.size;
}
