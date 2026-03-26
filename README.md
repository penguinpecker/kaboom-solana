# 💣 KABOOM! — Provably Fair Mines Game on Solana

A fully on-chain, provably fair 4×4 mines game built on Solana. Players place bets, reveal tiles, and avoid mines — with every game cryptographically verified using commit-reveal proofs.

**🎮 Play now:** [kaboom-solana.vercel.app](https://kaboom-solana.vercel.app)

![KABOOM Gameplay](https://img.shields.io/badge/status-live_on_devnet-green) ![Solana](https://img.shields.io/badge/chain-Solana-purple) ![License](https://img.shields.io/badge/license-MIT-blue)

---

## How It Works

1. **Place a bet** — Choose your wager amount and mine density (1–12 mines)
2. **Reveal tiles** — Click tiles on the 4×4 grid to uncover them
3. **Avoid mines** — Each safe tile increases your multiplier
4. **Cash out anytime** — Collect your winnings at the current multiplier, or keep going for higher rewards
5. **Hit a mine** — Lose your bet instantly

Every game uses **commit-reveal cryptography** — the mine layout is committed on-chain before you play, then revealed after. The house can't cheat.

## Architecture

```
┌─────────────────────┐     ┌──────────────────────┐
│   Next.js Frontend  │────▶│  Next.js API Routes   │
│   (Privy Auth)      │◀────│  (House Authority)    │
│   Vercel Edge       │     │  Vercel Serverless    │
└─────────┬───────────┘     └──────────┬────────────┘
          │                            │
          │     ┌──────────────────┐   │
          └────▶│  Solana Program  │◀──┘
                │  (Anchor/Rust)   │
                │  Devnet          │
                └──────────────────┘
```

### Key Design Decisions

- **Server-assisted commit-reveal**: Solana account data is publicly readable, so mine positions are encrypted in stateless session tokens (AES-256-GCM) passed to the client
- **Atomic reveal + settle**: On mine hit, both `reveal_tile` and `settle_game` go in ONE Solana transaction — prevents stuck game states
- **Zero CORS**: House server runs as Next.js API routes on the same Vercel domain
- **Privy Auth**: Email, Google, or wallet login — embedded wallets auto-sign transactions, no popup fatigue

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Smart Contract** | Anchor 0.32.1 / Rust |
| **Frontend** | Next.js 14, React, Tailwind CSS |
| **Auth** | Privy (email, Google, wallet) |
| **Wallet** | Privy embedded wallets (auto-sign) |
| **Server** | Next.js API Routes (Vercel serverless) |
| **Sessions** | AES-256-GCM encrypted stateless tokens |
| **Chain** | Solana Devnet |
| **Hosting** | Vercel |

## Program Details

| | |
|---|---|
| **Program ID** | `Gw7rMAw65i3vZXrZjfbTgCe1uRjQw5VtY5Qc6Ksxrwc4` |
| **Vault PDA** | `5AE1Ge893UhJCUxPZj4dAP4VMR2hGQBP9fHL6TiZpxAw` |
| **Grid** | 4×4 (16 tiles) |
| **Mines** | 1–12 configurable |
| **Min Bet** | 0.001 SOL |
| **House Edge** | 2% |
| **Max Payout** | 50% of vault balance |
| **Game Expiry** | 300 slots (~2 minutes) |

### Program Instructions

| Instruction | Signer | Description |
|------------|--------|-------------|
| `initialize_vault` | Owner | Create vault with config |
| `fund_vault` | Owner | Deposit SOL into vault |
| `start_game` | Player | Place bet, commit mine layout hash |
| `reveal_tile` | House | Reveal a tile (safe or mine) |
| `cash_out` | Player | Collect winnings at current multiplier |
| `settle_game` | House | Reveal mine layout + salt proof |
| `close_game` | Player | Close game PDA, reclaim rent |
| `refund_expired` | Player | Refund bet if game expired |
| `withdraw_vault` | Owner | Withdraw SOL from vault |
| `update_vault` | Owner | Update vault config |

## Project Structure

```
kaboom-solana/
├── programs/kaboom/
│   └── src/lib.rs              # Anchor program (all 10 instructions)
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── api/            # Server-side API routes
│   │   │   │   ├── commit/     # Create game session, return encrypted token
│   │   │   │   ├── reveal/     # Decrypt token, check tile, send tx
│   │   │   │   ├── settle/     # Cash out + settle with proof
│   │   │   │   ├── cleanup/    # Handle stuck game PDAs
│   │   │   │   └── health/     # Vault status endpoint
│   │   │   ├── play/           # Game page
│   │   │   ├── vault/          # Vault stats + deposit
│   │   │   ├── leaderboard/    # Player rankings
│   │   │   └── logs/           # Game history
│   │   ├── components/
│   │   │   ├── game/           # Grid, Tile, BetControls
│   │   │   ├── layout/         # Navbar, Footer
│   │   │   └── modals/         # ModalRoot, ModalShell
│   │   ├── hooks/
│   │   │   ├── useGame.tsx     # Core game logic + Privy wallet
│   │   │   ├── useContracts.tsx # On-chain vault data
│   │   │   └── useGameHistory.ts # localStorage cache
│   │   ├── lib/
│   │   │   ├── chain.ts        # Program ID, PDAs, config
│   │   │   ├── compat.ts       # Privy wallet compat layer
│   │   │   └── server/
│   │   │       ├── config.ts   # Server config (lazy-loaded)
│   │   │       ├── game.ts     # Mine generation, tile checking
│   │   │       ├── session.ts  # AES-256-GCM encrypt/decrypt
│   │   │       ├── instructions.ts # Anchor instruction builders
│   │   │       └── solana.ts   # Transaction sending
│   │   └── providers/
│   │       └── Web3Provider.tsx # Privy + ConnectionProvider
│   └── .env.local              # Environment variables
├── Anchor.toml
└── README.md
```

## Getting Started

### Prerequisites

- [Rust](https://rustup.rs/) + [Solana CLI](https://docs.solana.com/cli/install-solana-cli-tools) + [Anchor](https://www.anchor-lang.com/docs/installation)
- [Node.js](https://nodejs.org/) 18+
- [Privy Account](https://dashboard.privy.io/) (free)

### 1. Deploy the Program

```bash
# Configure Solana for devnet
solana config set -u https://api.devnet.solana.com

# Airdrop SOL for deployment
solana airdrop 5

# Build and deploy
anchor build
solana program deploy target/deploy/kaboom.so
```

### 2. Initialize the Vault

```bash
cd kaboom-house-server

# Copy and fill environment variables
cp .env.example .env
# Edit .env with your program ID, keys, and RPC URL

# Initialize vault on-chain
npm run init-vault

# Fund the vault
npm run fund-vault -- 2
```

### 3. Run the Frontend

```bash
cd frontend

# Install dependencies
npm install

# Set up environment variables
cat > .env.local << EOF
NEXT_PUBLIC_SOLANA_RPC=https://api.devnet.solana.com
NEXT_PUBLIC_PRIVY_APP_ID=your_privy_app_id
SOLANA_RPC=https://api.devnet.solana.com
PROGRAM_ID=your_program_id
HOUSE_AUTHORITY_KEY=[your_house_key_json_array]
EOF

# Run locally
npm run dev
```

Visit `http://localhost:3000` to play.

### 4. Deploy to Vercel

```bash
# Push to GitHub — Vercel auto-deploys
git push origin main
```

Add these environment variables in Vercel dashboard:

| Variable | Scope | Value |
|----------|-------|-------|
| `NEXT_PUBLIC_SOLANA_RPC` | Public | Your Solana RPC URL |
| `NEXT_PUBLIC_PRIVY_APP_ID` | Public | Your Privy App ID |
| `SOLANA_RPC` | Server | Your Solana RPC URL |
| `PROGRAM_ID` | Server | Your program ID |
| `HOUSE_AUTHORITY_KEY` | Server | House authority keypair JSON array |

## Provable Fairness

Every game is cryptographically verifiable:

1. **Before the game**: Server generates a random mine layout + salt, computes `commitment = SHA256(layout || mineCount || salt)`, and commits it on-chain
2. **During the game**: Player reveals tiles. Each reveal is recorded on-chain by the house authority
3. **After the game**: Server reveals the mine layout and salt. Anyone can verify `SHA256(layout || mineCount || salt) == commitment`

The commitment is visible on-chain before any tile is revealed — the house cannot change the mine positions after the game starts.

## Security

- **Commit-reveal scheme** prevents house from manipulating mine positions
- **On-chain settlement** ensures payouts are trustless
- **Encrypted session tokens** (AES-256-GCM) protect mine layouts from client inspection
- **House authority** can only reveal tiles and settle games — cannot steal funds
- **Game expiry** (300 slots) ensures stuck games can always be refunded

## License

MIT

---

Built by [@penguinpecker](https://github.com/penguinpecker) | Ported from [KABOOM on Somnia](https://github.com/penguinpecker/kaboom-game)
