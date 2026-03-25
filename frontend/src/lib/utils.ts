import { GAME_CONFIG } from "./chain";

const { GRID_SIZE, HOUSE_EDGE } = GAME_CONFIG;

/** Calculate multiplier for `safeTiles` revealed out of `total` tiles with `mineCount` mines */
export function calcMultiplier(safeTiles: number, mineCount: number): number {
  let m = 1;
  for (let i = 0; i < safeTiles; i++) {
    const remaining = GRID_SIZE - i;
    const safeRemaining = GRID_SIZE - mineCount - i;
    if (safeRemaining > 0) {
      m *= remaining / safeRemaining;
    }
  }
  return m * (1 - HOUSE_EDGE);
}

/** Calculate full clear multiplier */
export function fullClearMultiplier(mineCount: number): number {
  return calcMultiplier(GRID_SIZE - mineCount, mineCount);
}

/** Calculate next tile multiplier from current state */
export function nextTileMultiplier(revealedCount: number, mineCount: number): number {
  return calcMultiplier(revealedCount + 1, mineCount);
}

/** Format multiplier for display */
export function formatMult(mult: number): string {
  return mult.toFixed(2) + "×";
}

/** Format STT amount */
export function formatSTT(amount: number): string {
  if (amount >= 1000) return (amount / 1000).toFixed(1) + "K";
  return amount.toLocaleString();
}

/** Generate random hex string */
export function randomHex(length: number): string {
  return Array.from({ length }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
}

/** Generate random player name */
const NAMES = ["PHANTOM","VEXER","GHOST","NEON","CYBER","SHADOW","STRIKE","BLADE","ZERO","APEX","NOVA","FLUX","SURGE","DRIFT","PULSE","WRAITH","SPECTRE","ROGUE","TITAN","ONYX"];
export function randomName(): string {
  return NAMES[Math.floor(Math.random() * NAMES.length)] + "_" + Math.floor(Math.random() * 99);
}

export function randomBet(): number {
  return [10, 25, 50, 100, 200, 500, 1000][Math.floor(Math.random() * 7)];
}
