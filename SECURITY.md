# KABOOM! v2 — Security Architecture

## Threat Model

### Actors
- **Player**: Connects wallet, places bets, reveals tiles, cashes out
- **House Authority**: Server key that generates mine layouts, reveals tiles, settles games
- **Owner**: Vault operator, can withdraw profits and update config
- **Attacker**: Any external party trying to exploit the game

### Critical Invariant
> **A player must NEVER know mine positions before clicking tiles.**

On Solana, all account data is publicly readable via `getAccountInfo()`. This means
storing mine positions on-chain during gameplay would let any player read them via RPC
and guarantee a win every game.

**Solution: Server-assisted commit-reveal** (industry standard for all production
crypto casino games including Stake, DuelNow, Rollbit, etc.)

## How Commit-Reveal Works

```
SERVER                                BLOCKCHAIN
  │                                      │
  │ 1. Generate mine_layout + salt       │
  │    commitment = keccak256(layout      │
  │                 || mine_count         │
  │                 || salt)              │
  │                                      │
  │──── Player calls start_game() ──────>│  Bet locked, commitment stored
  │                                      │
  │ 2. Player clicks tile                │
  │<──── Tile index sent to server ──────│
  │                                      │
  │ 3. Server checks mine_layout[tile]   │
  │──── Server calls reveal_tile() ─────>│  Safe/mine recorded on-chain
  │                                      │
  │     (repeat steps 2-3...)            │
  │                                      │
  │ 4. Game ends (win/loss)              │
  │──── Server calls settle_game() ─────>│  mine_layout + salt revealed
  │                                      │  Program verifies:
  │                                      │  • hash(layout||count||salt) == commitment
  │                                      │  • all reveals match actual layout
  │                                      │  • mine count matches
```

## What If The Server Cheats?

| Attack | Protection |
|--------|------------|
| Server changes mine layout mid-game | Commitment is immutable. settle_game verifies keccak256 hash. |
| Server says "mine" on safe tile | settle_game verifies every reveal against actual layout. If mismatch → tx fails. |
| Server refuses to settle game | Player calls refund_expired after 300 slots (~2 min). Full bet returned. |
| Server generates biased layouts | Use Switchboard VRF seed as input to layout generation (server-side). Seed is verifiable. |
| Owner drains vault | Trust assumption — this is the house's own money. Documented as design choice. |

## On-Chain Security Measures

### 1. Single Active Game Per Player
Game PDA: `seeds = [GAME_SEED, player_pubkey]` — no nonce. Player must close their
game before starting a new one. Prevents:
- Rent griefing (creating thousands of game PDAs)
- Stale game accumulation

### 2. Bet Limits
- **Min bet**: 0.001 SOL (prevents dust spam)
- **Max bet**: Configurable % of vault balance (default 2%)
- **Max payout**: Worst-case multiplier checked against vault at start_game

### 3. Game Expiry
Games expire after `GAME_EXPIRY_SLOTS` (300 slots ≈ 2 minutes). If the server
fails to complete the game, the player gets a full refund. This prevents:
- Locked funds from server outages
- Griefing by the house

### 4. Checked Arithmetic
All math uses `checked_mul`, `saturating_add`, `saturating_sub`. No overflow is possible.

### 5. Authority Separation
- **Owner**: Can withdraw, update config, pause
- **House Authority**: Can reveal tiles, settle games
- Neither can impersonate the other

### 6. Event Emissions
Every state change emits an event for off-chain indexing and auditing:
- GameStarted, TileRevealed, GameWon, GameLost, GameSettled, GameRefunded

## Known Limitations (Trust Assumptions)

These are design choices, NOT vulnerabilities:

1. **Server must be online** — If the server goes down, games expire and players get refunds.
   No funds are lost, but UX degrades.

2. **Server can refuse to start games** — It can't steal existing bets (expiry refund), but it
   can refuse to generate commitments for new games. This is just the house choosing not to
   operate.

3. **Owner can drain vault** — The vault holds the house's own capital. This is the same as
   a casino owner emptying their own safe. Players' active bets are protected by expiry refund.

4. **House edge is configurable** — Owner can change it. Players should verify on-chain before
   betting. UI should display the current edge.

## Verification

Anyone can verify historical game fairness:

```typescript
import { keccak256 } from "@ethersproject/keccak256";

function verifyGame(mineLayout: number, mineCount: number, salt: Uint8Array, commitment: Uint8Array): boolean {
  const layoutBytes = new Uint8Array(2);
  new DataView(layoutBytes.buffer).setUint16(0, mineLayout, true); // little-endian
  const preimage = new Uint8Array([...layoutBytes, mineCount, ...salt]);
  const hash = keccak256(preimage);
  return hash === commitment;
}
```
