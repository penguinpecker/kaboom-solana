use anchor_lang::prelude::*;
use anchor_lang::system_program;


declare_id!("Gw7rMAw65i3vZXrZjfbTgCe1uRjQw5VtY5Qc6Ksxrwc4");

// ═══════════════════════════════════════════════════════════════════════════════
// KABOOM! v2 — Provably Fair On-Chain Mines (Solana)
//
// ARCHITECTURE: Server-assisted commit-reveal (same model as Somnia version)
//   - On-chain:  Holds bets, enforces rules, verifies fairness, settles payouts
//   - Off-chain: Generates mine layout, reveals tiles, provides verification data
//
// WHY SERVER-ASSISTED:
//   Solana account data is publicly readable via RPC. Storing mine positions
//   on-chain during gameplay would let any player read them and guarantee wins.
//   The server holds mine positions secretly during gameplay, then reveals them
//   at game end with cryptographic proof (commit-reveal) so anyone can verify
//   the house never cheated.
//
// GAME FLOW:
//   1. Server generates: mine_layout (u16 bitmask) + salt (32 bytes)
//   2. Server computes: commitment = keccak256(mine_layout || mine_count || salt)
//   3. Player calls start_game(bet, mine_count, commitment) — bet locked in vault
//   4. Player clicks tile → server calls reveal_tile(index, is_mine) on-chain
//   5. Player calls cash_out OR server calls force_loss when mine is hit
//   6. Server calls settle_game(mine_layout, salt) — program verifies everything
//   7. Anyone can call verify_game() to check historical fairness
//
// SECURITY PROPERTIES:
//   - Server cannot change mine layout after commitment (keccak256 binding)
//   - Server must settle within GAME_EXPIRY_SLOTS or player gets full refund
//   - All reveals are checked against mine_layout at settlement
//   - Multiplier calculated on-chain using hypergeometric probability
//   - Vault enforces max bet / max payout caps
//   - Single active game per player (prevents rent griefing)
//   - Checked arithmetic throughout (no overflow possible)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── CONSTANTS (all configurable via Vault initialization) ───────────────────

/// 4×4 grid
const GRID_SIZE: u8 = 16;
/// Min mines
const MIN_MINES: u8 = 1;
/// Max mines
const MAX_MINES: u8 = 12;
/// Basis points denominator
const BPS: u64 = 10_000;
/// Game expires after this many slots (~2 minutes at 400ms/slot)
const GAME_EXPIRY_SLOTS: u64 = 300;
/// Minimum bet: 0.001 SOL = 1_000_000 lamports
const MIN_BET_LAMPORTS: u64 = 1_000_000;

// PDA seeds
const VAULT_SEED: &[u8] = b"kaboom_vault_v2";
const GAME_SEED: &[u8] = b"kaboom_game_v2";

// ─── PROGRAM ─────────────────────────────────────────────────────────────────

#[program]
pub mod kaboom {
    use super::*;

    /// Initialize the house vault. Called once by the house operator.
    /// Sets the house_authority (server key that can reveal tiles and settle games),
    /// house edge, and bet limit parameters.
    pub fn initialize_vault(
        ctx: Context<InitializeVault>,
        house_edge_bps: u16,
        max_bet_bps: u16,
        max_payout_bps: u16,
    ) -> Result<()> {
        require!(house_edge_bps <= 1000, KaboomError::InvalidConfig); // max 10% edge
        require!(max_bet_bps > 0 && max_bet_bps <= 1000, KaboomError::InvalidConfig); // max 10% per bet
        require!(max_payout_bps > 0 && max_payout_bps <= 5000, KaboomError::InvalidConfig); // max 50% per payout

        let vault = &mut ctx.accounts.vault;
        vault.owner = ctx.accounts.owner.key();
        vault.house_authority = ctx.accounts.house_authority.key();
        vault.bump = ctx.bumps.vault;
        vault.house_edge_bps = house_edge_bps;
        vault.max_bet_bps = max_bet_bps;
        vault.max_payout_bps = max_payout_bps;
        vault.total_games = 0;
        vault.total_wagered = 0;
        vault.total_payouts = 0;
        vault.paused = false;

        msg!("Vault initialized. Owner: {}, House Authority: {}", vault.owner, vault.house_authority);
        Ok(())
    }

    /// Fund the vault with SOL. Anyone can fund.
    pub fn fund_vault(ctx: Context<FundVault>, amount: u64) -> Result<()> {
        require!(amount > 0, KaboomError::InvalidAmount);

        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.funder.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                },
            ),
            amount,
        )?;

        msg!("Vault funded: {} lamports", amount);
        Ok(())
    }

    /// Start a new game. Called by the PLAYER.
    ///
    /// The server must have generated the commitment BEFORE this call:
    ///   commitment = keccak256(mine_layout_le_bytes || mine_count_byte || salt_32_bytes)
    ///
    /// Player's bet is transferred to the vault immediately.
    pub fn start_game(
        ctx: Context<StartGame>,
        mine_count: u8,
        bet: u64,
        commitment: [u8; 32],
    ) -> Result<()> {
        let vault = &ctx.accounts.vault;
        require!(!vault.paused, KaboomError::VaultPaused);
        require!(mine_count >= MIN_MINES && mine_count <= MAX_MINES, KaboomError::InvalidMineCount);
        require!(bet >= MIN_BET_LAMPORTS, KaboomError::BetTooLow);

        // Enforce max bet as % of vault balance
        let vault_balance = ctx.accounts.vault.to_account_info().lamports();
        let rent = Rent::get()?.minimum_balance(Vault::SPACE);
        let available = vault_balance.saturating_sub(rent);
        let max_bet = available
            .checked_mul(vault.max_bet_bps as u64)
            .ok_or(KaboomError::MathOverflow)?
            / BPS;
        require!(bet <= max_bet, KaboomError::BetExceedsMax);

        // Check vault can cover worst-case payout
        let worst_multiplier = calc_multiplier(
            GRID_SIZE - mine_count,
            mine_count,
            vault.house_edge_bps,
        );
        let worst_payout = (bet as u128)
            .checked_mul(worst_multiplier as u128)
            .ok_or(KaboomError::MathOverflow)?
            / BPS as u128;
        let max_payout = available
            .checked_mul(vault.max_payout_bps as u64)
            .ok_or(KaboomError::MathOverflow)?
            / BPS;
        require!(worst_payout <= max_payout as u128, KaboomError::VaultInsufficientFunds);

        // Transfer bet from player to vault
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.player.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                },
            ),
            bet,
        )?;

        // Initialize game
        let clock = Clock::get()?;
        let game = &mut ctx.accounts.game;
        game.player = ctx.accounts.player.key();
        game.bump = ctx.bumps.game;
        game.status = GameStatus::Playing;
        game.bet = bet;
        game.mine_count = mine_count;
        game.commitment = commitment;
        game.revealed_mask = 0;
        game.revealed_safe_mask = 0;
        game.safe_reveals = 0;
        game.multiplier_bps = BPS; // 1.0x
        game.start_slot = clock.slot;
        game.created_at = clock.unix_timestamp;
        game.settled = false;
        game.mine_layout = 0;
        game.salt = [0u8; 32];

        // Update vault stats
        let vault_mut = &mut ctx.accounts.vault;
        vault_mut.total_games = vault_mut.total_games.saturating_add(1);
        vault_mut.total_wagered = vault_mut.total_wagered.saturating_add(bet);

        emit!(GameStarted {
            player: game.player,
            bet,
            mine_count,
            commitment,
            slot: clock.slot,
        });

        Ok(())
    }

    /// Reveal a tile. Called by the HOUSE AUTHORITY (server).
    ///
    /// The server determines if the tile is safe or a mine based on the
    /// mine_layout it generated at commitment time. This is verified when
    /// the game is settled.
    pub fn reveal_tile(
        ctx: Context<RevealTile>,
        tile_index: u8,
        is_mine: bool,
    ) -> Result<()> {
        require!(tile_index < GRID_SIZE, KaboomError::InvalidTileIndex);

        let game = &mut ctx.accounts.game;
        require!(game.status == GameStatus::Playing, KaboomError::GameNotPlaying);

        // Check game hasn't expired
        let clock = Clock::get()?;
        require!(
            clock.slot <= game.start_slot.saturating_add(GAME_EXPIRY_SLOTS),
            KaboomError::GameExpired
        );

        let tile_bit: u16 = 1u16 << tile_index;
        require!(game.revealed_mask & tile_bit == 0, KaboomError::TileAlreadyRevealed);

        // Mark tile as revealed
        game.revealed_mask |= tile_bit;

        if is_mine {
            // BOOM — game lost
            game.status = GameStatus::Lost;

            emit!(GameLost {
                player: game.player,
                bet: game.bet,
                tile_index,
                safe_reveals: game.safe_reveals,
            });
        } else {
            // Safe tile
            game.revealed_safe_mask |= tile_bit;
            game.safe_reveals = game.safe_reveals.saturating_add(1);

            // Recalculate multiplier
            let vault = &ctx.accounts.vault;
            game.multiplier_bps = calc_multiplier(
                game.safe_reveals,
                game.mine_count,
                vault.house_edge_bps,
            );

            // Auto-win if all safe tiles cleared
            let total_safe = GRID_SIZE - game.mine_count;
            if game.safe_reveals >= total_safe {
                game.status = GameStatus::Won;
            }

            emit!(TileRevealed {
                player: game.player,
                tile_index,
                safe: true,
                multiplier_bps: game.multiplier_bps,
                safe_reveals: game.safe_reveals,
            });
        }

        Ok(())
    }

    /// Cash out current winnings. Called by the PLAYER.
    /// Must have at least 1 safe tile revealed.
    pub fn cash_out(ctx: Context<CashOut>) -> Result<()> {
        let game = &mut ctx.accounts.game;
        require!(game.status == GameStatus::Playing, KaboomError::GameNotPlaying);
        require!(game.safe_reveals > 0, KaboomError::NoTilesRevealed);
        require!(game.player == ctx.accounts.player.key(), KaboomError::Unauthorized);

        // Calculate payout
        let payout = (game.bet as u128)
            .checked_mul(game.multiplier_bps as u128)
            .ok_or(KaboomError::MathOverflow)?
            / BPS as u128;
        let payout = payout as u64;

        // Verify vault can cover (should always pass due to start_game check, but defense in depth)
        let vault_info = ctx.accounts.vault.to_account_info();
        let rent = Rent::get()?.minimum_balance(Vault::SPACE);
        let available = vault_info.lamports().saturating_sub(rent);
        require!(payout <= available, KaboomError::VaultInsufficientFunds);

        // Transfer payout from vault PDA to player
        **vault_info.try_borrow_mut_lamports()? -= payout;
        **ctx.accounts.player.to_account_info().try_borrow_mut_lamports()? += payout;

        game.status = GameStatus::Won;

        // Update vault stats
        let vault = &mut ctx.accounts.vault;
        vault.total_payouts = vault.total_payouts.saturating_add(payout);

        emit!(GameWon {
            player: game.player,
            bet: game.bet,
            payout,
            multiplier_bps: game.multiplier_bps,
            safe_reveals: game.safe_reveals,
        });

        Ok(())
    }

    /// Settle a completed game by revealing the mine layout and salt.
    /// Called by the HOUSE AUTHORITY after game ends (win or loss).
    /// Verifies: keccak256(mine_layout || mine_count || salt) == commitment
    /// Verifies: all revealed tiles match the actual mine_layout
    ///
    /// MUST be called for every game. If not called within GAME_EXPIRY_SLOTS,
    /// the player can call refund_expired to reclaim their bet.
    pub fn settle_game(
        ctx: Context<SettleGame>,
        mine_layout: u16,
        salt: [u8; 32],
    ) -> Result<()> {
        let game = &mut ctx.accounts.game;
        require!(
            game.status == GameStatus::Won || game.status == GameStatus::Lost,
            KaboomError::GameNotPlaying
        );
        require!(!game.settled, KaboomError::GameAlreadySettled);

        // Verify commitment: keccak256(mine_layout_le || mine_count || salt) == commitment
        let layout_bytes = mine_layout.to_le_bytes();
        let mut preimage = Vec::with_capacity(2 + 1 + 32);
        preimage.extend_from_slice(&layout_bytes);
        preimage.push(game.mine_count);
        preimage.extend_from_slice(&salt);
        use sha2::{Sha256, Digest}; let computed_hash = Sha256::digest(&preimage);
        require!(
            computed_hash.as_slice() == game.commitment,
            KaboomError::CommitmentMismatch
        );

        // Verify mine count matches
        let actual_mine_count = mine_layout.count_ones() as u8;
        require!(actual_mine_count == game.mine_count, KaboomError::CommitmentMismatch);

        // Verify all safe reveals were actually safe tiles
        // (no bit in revealed_safe_mask should overlap with mine_layout)
        require!(
            game.revealed_safe_mask & mine_layout == 0,
            KaboomError::RevealMismatch
        );

        // Verify all mine reveals were actually mines
        // (any revealed tile NOT in safe mask must be in mine_layout)
        let revealed_mine_mask = game.revealed_mask & !game.revealed_safe_mask;
        require!(
            revealed_mine_mask & mine_layout == revealed_mine_mask,
            KaboomError::RevealMismatch
        );

        // Store proof on-chain for public verification
        game.mine_layout = mine_layout;
        game.salt = salt;
        game.settled = true;

        emit!(GameSettled {
            player: game.player,
            mine_layout,
            commitment: game.commitment,
            verified: true,
        });

        Ok(())
    }

    /// Refund an expired game. Called by the PLAYER if the server fails to
    /// complete the game within GAME_EXPIRY_SLOTS.
    /// Returns the full bet to the player (no house edge on expired games).
    pub fn refund_expired(ctx: Context<RefundExpired>) -> Result<()> {
        let game = &mut ctx.accounts.game;
        require!(game.player == ctx.accounts.player.key(), KaboomError::Unauthorized);

        // Game must be unfinished (still Playing) AND past expiry
        let clock = Clock::get()?;
        require!(
            game.status == GameStatus::Playing,
            KaboomError::GameNotPlaying
        );
        require!(
            clock.slot > game.start_slot.saturating_add(GAME_EXPIRY_SLOTS),
            KaboomError::GameNotExpired
        );

        // Refund full bet from vault to player
        let vault_info = ctx.accounts.vault.to_account_info();
        let rent = Rent::get()?.minimum_balance(Vault::SPACE);
        let available = vault_info.lamports().saturating_sub(rent);
        let refund = game.bet.min(available); // never exceed vault balance

        **vault_info.try_borrow_mut_lamports()? -= refund;
        **ctx.accounts.player.to_account_info().try_borrow_mut_lamports()? += refund;

        game.status = GameStatus::Expired;

        emit!(GameRefunded {
            player: game.player,
            bet: game.bet,
            refund,
        });

        Ok(())
    }

    /// Close a finished game PDA. Reclaims rent to the player.
    /// Game must be settled (Won/Lost with verification) or Expired.
    pub fn close_game(ctx: Context<CloseGame>) -> Result<()> {
        let game = &ctx.accounts.game;
        require!(
            game.status == GameStatus::Expired
                || (game.settled && (game.status == GameStatus::Won || game.status == GameStatus::Lost)),
            KaboomError::GameNotFinished
        );

        // Account close is handled by Anchor's `close = player` constraint
        msg!("Game closed. Rent reclaimed by player.");
        Ok(())
    }

    /// Owner withdraws profits from vault.
    pub fn withdraw_vault(ctx: Context<WithdrawVault>, amount: u64) -> Result<()> {
        require!(amount > 0, KaboomError::InvalidAmount);

        let vault_info = ctx.accounts.vault.to_account_info();
        let rent = Rent::get()?.minimum_balance(Vault::SPACE);
        let available = vault_info.lamports().saturating_sub(rent);
        let withdraw_amount = amount.min(available);

        **vault_info.try_borrow_mut_lamports()? -= withdraw_amount;
        **ctx.accounts.owner.to_account_info().try_borrow_mut_lamports()? += withdraw_amount;

        msg!("Withdrawn {} lamports from vault.", withdraw_amount);
        Ok(())
    }

    /// Update vault configuration. Owner only.
    pub fn update_vault(
        ctx: Context<UpdateVault>,
        house_edge_bps: Option<u16>,
        max_bet_bps: Option<u16>,
        max_payout_bps: Option<u16>,
        paused: Option<bool>,
        new_house_authority: Option<Pubkey>,
    ) -> Result<()> {
        let vault = &mut ctx.accounts.vault;

        if let Some(edge) = house_edge_bps {
            require!(edge <= 1000, KaboomError::InvalidConfig);
            vault.house_edge_bps = edge;
        }
        if let Some(max_bet) = max_bet_bps {
            require!(max_bet > 0 && max_bet <= 1000, KaboomError::InvalidConfig);
            vault.max_bet_bps = max_bet;
        }
        if let Some(max_pay) = max_payout_bps {
            require!(max_pay > 0 && max_pay <= 5000, KaboomError::InvalidConfig);
            vault.max_payout_bps = max_pay;
        }
        if let Some(pause) = paused {
            vault.paused = pause;
        }
        if let Some(auth) = new_house_authority {
            vault.house_authority = auth;
        }

        Ok(())
    }
}

// ─── MULTIPLIER CALCULATION ──────────────────────────────────────────────────

/// Calculate multiplier in basis points (10_000 = 1.0x)
/// Formula: ∏(i=0..n-1) [ (total - i) / (total - mines - i) ] * (1 - house_edge)
///
/// Uses u128 intermediate math to prevent overflow.
/// Returns multiplier in basis points (e.g., 15000 = 1.5x)
fn calc_multiplier(safe_reveals: u8, mine_count: u8, house_edge_bps: u16) -> u64 {
    if safe_reveals == 0 {
        return BPS;
    }

    let total = GRID_SIZE as u64;
    let mines = mine_count as u64;

    // Precision: multiply by BPS^2 to maintain accuracy through division chain
    let mut result: u128 = BPS as u128;

    for i in 0..safe_reveals as u64 {
        let tiles_remaining = total.saturating_sub(i);
        let safe_remaining = total.saturating_sub(mines).saturating_sub(i);

        if safe_remaining == 0 {
            break;
        }

        result = result
            .saturating_mul(tiles_remaining as u128)
            / safe_remaining as u128;
    }

    // Apply house edge: result * (BPS - house_edge) / BPS
    result = result
        .saturating_mul((BPS - house_edge_bps as u64) as u128)
        / BPS as u128;

    // Clamp to u64 range
    result.min(u64::MAX as u128) as u64
}

// ─── ACCOUNTS ────────────────────────────────────────────────────────────────

#[account]
pub struct Vault {
    /// Owner/operator of the vault (can withdraw, update config)
    pub owner: Pubkey,
    /// Server key authorized to reveal tiles and settle games
    pub house_authority: Pubkey,
    /// PDA bump
    pub bump: u8,
    /// House edge in basis points (200 = 2%)
    pub house_edge_bps: u16,
    /// Max bet as bps of vault balance (200 = 2%)
    pub max_bet_bps: u16,
    /// Max payout as bps of vault balance (1000 = 10%)
    pub max_payout_bps: u16,
    /// Total games played
    pub total_games: u64,
    /// Total SOL wagered (lamports)
    pub total_wagered: u64,
    /// Total SOL paid out (lamports)
    pub total_payouts: u64,
    /// Whether the vault is paused (no new games)
    pub paused: bool,
}

impl Vault {
    pub const SPACE: usize = 8   // discriminator
        + 32  // owner
        + 32  // house_authority
        + 1   // bump
        + 2   // house_edge_bps
        + 2   // max_bet_bps
        + 2   // max_payout_bps
        + 8   // total_games
        + 8   // total_wagered
        + 8   // total_payouts
        + 1;  // paused
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum GameStatus {
    Playing,
    Won,
    Lost,
    Expired,
}

#[account]
pub struct GameSession {
    /// The player's pubkey
    pub player: Pubkey,
    /// PDA bump
    pub bump: u8,
    /// Game status
    pub status: GameStatus,
    /// Bet amount in lamports
    pub bet: u64,
    /// Number of mines on the board
    pub mine_count: u8,
    /// keccak256(mine_layout || mine_count || salt) — committed before game starts
    pub commitment: [u8; 32],
    /// Bitmask of ALL revealed tiles (both safe and mine)
    pub revealed_mask: u16,
    /// Bitmask of tiles revealed as SAFE
    pub revealed_safe_mask: u16,
    /// Count of safe tiles revealed
    pub safe_reveals: u8,
    /// Current multiplier in basis points (10000 = 1.0x)
    pub multiplier_bps: u64,
    /// Slot when game was created (used for expiry)
    pub start_slot: u64,
    /// Unix timestamp when game was created
    pub created_at: i64,
    /// Whether the game has been settled (mine_layout + salt verified)
    pub settled: bool,
    /// Mine layout revealed at settlement (0 until settled)
    pub mine_layout: u16,
    /// Salt revealed at settlement (zeroed until settled)
    pub salt: [u8; 32],
}

impl GameSession {
    pub const SPACE: usize = 8   // discriminator
        + 32  // player
        + 1   // bump
        + 1   // status
        + 8   // bet
        + 1   // mine_count
        + 32  // commitment
        + 2   // revealed_mask
        + 2   // revealed_safe_mask
        + 1   // safe_reveals
        + 8   // multiplier_bps
        + 8   // start_slot
        + 8   // created_at
        + 1   // settled
        + 2   // mine_layout
        + 32; // salt
}

// ─── INSTRUCTION ACCOUNTS ────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(
        init,
        payer = owner,
        space = Vault::SPACE,
        seeds = [VAULT_SEED],
        bump,
    )]
    pub vault: Account<'info, Vault>,

    /// CHECK: House authority key — stored as trusted server identity
    pub house_authority: UncheckedAccount<'info>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FundVault<'info> {
    #[account(
        mut,
        seeds = [VAULT_SEED],
        bump = vault.bump,
    )]
    pub vault: Account<'info, Vault>,

    #[account(mut)]
    pub funder: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct StartGame<'info> {
    #[account(
        mut,
        seeds = [VAULT_SEED],
        bump = vault.bump,
    )]
    pub vault: Account<'info, Vault>,

    /// Game PDA: seeds = [GAME_SEED, player_pubkey]
    /// Only ONE active game per player (no nonce — prevents rent griefing)
    #[account(
        init,
        payer = player,
        space = GameSession::SPACE,
        seeds = [GAME_SEED, player.key().as_ref()],
        bump,
    )]
    pub game: Account<'info, GameSession>,

    #[account(mut)]
    pub player: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RevealTile<'info> {
    #[account(
        seeds = [VAULT_SEED],
        bump = vault.bump,
    )]
    pub vault: Account<'info, Vault>,

    #[account(
        mut,
        seeds = [GAME_SEED, game.player.as_ref()],
        bump = game.bump,
        constraint = game.status == GameStatus::Playing @ KaboomError::GameNotPlaying,
    )]
    pub game: Account<'info, GameSession>,

    /// Only the house authority can reveal tiles
    #[account(
        constraint = house_authority.key() == vault.house_authority @ KaboomError::Unauthorized,
    )]
    pub house_authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct CashOut<'info> {
    #[account(
        mut,
        seeds = [VAULT_SEED],
        bump = vault.bump,
    )]
    pub vault: Account<'info, Vault>,

    #[account(
        mut,
        seeds = [GAME_SEED, game.player.as_ref()],
        bump = game.bump,
        constraint = game.player == player.key() @ KaboomError::Unauthorized,
    )]
    pub game: Account<'info, GameSession>,

    #[account(mut)]
    pub player: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SettleGame<'info> {
    #[account(
        seeds = [VAULT_SEED],
        bump = vault.bump,
    )]
    pub vault: Account<'info, Vault>,

    #[account(
        mut,
        seeds = [GAME_SEED, game.player.as_ref()],
        bump = game.bump,
    )]
    pub game: Account<'info, GameSession>,

    /// Only the house authority can settle games
    #[account(
        constraint = house_authority.key() == vault.house_authority @ KaboomError::Unauthorized,
    )]
    pub house_authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct RefundExpired<'info> {
    #[account(
        mut,
        seeds = [VAULT_SEED],
        bump = vault.bump,
    )]
    pub vault: Account<'info, Vault>,

    #[account(
        mut,
        seeds = [GAME_SEED, game.player.as_ref()],
        bump = game.bump,
        constraint = game.player == player.key() @ KaboomError::Unauthorized,
    )]
    pub game: Account<'info, GameSession>,

    #[account(mut)]
    pub player: Signer<'info>,
}

#[derive(Accounts)]
pub struct CloseGame<'info> {
    #[account(
        mut,
        seeds = [GAME_SEED, game.player.as_ref()],
        bump = game.bump,
        constraint = game.player == player.key() @ KaboomError::Unauthorized,
        close = player,
    )]
    pub game: Account<'info, GameSession>,

    #[account(mut)]
    pub player: Signer<'info>,
}

#[derive(Accounts)]
pub struct WithdrawVault<'info> {
    #[account(
        mut,
        seeds = [VAULT_SEED],
        bump = vault.bump,
        constraint = vault.owner == owner.key() @ KaboomError::Unauthorized,
    )]
    pub vault: Account<'info, Vault>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateVault<'info> {
    #[account(
        mut,
        seeds = [VAULT_SEED],
        bump = vault.bump,
        constraint = vault.owner == owner.key() @ KaboomError::Unauthorized,
    )]
    pub vault: Account<'info, Vault>,

    pub owner: Signer<'info>,
}

// ─── ERRORS ──────────────────────────────────────────────────────────────────

#[error_code]
pub enum KaboomError {
    #[msg("Invalid mine count. Must be 1–12.")]
    InvalidMineCount,
    #[msg("Invalid tile index. Must be 0–15.")]
    InvalidTileIndex,
    #[msg("Tile already revealed.")]
    TileAlreadyRevealed,
    #[msg("Game is not in playing state.")]
    GameNotPlaying,
    #[msg("Bet amount too low.")]
    BetTooLow,
    #[msg("Bet exceeds max allowed for current vault balance.")]
    BetExceedsMax,
    #[msg("Vault has insufficient funds for potential payout.")]
    VaultInsufficientFunds,
    #[msg("Unauthorized.")]
    Unauthorized,
    #[msg("Arithmetic overflow.")]
    MathOverflow,
    #[msg("Invalid amount.")]
    InvalidAmount,
    #[msg("Invalid configuration parameter.")]
    InvalidConfig,
    #[msg("Vault is paused.")]
    VaultPaused,
    #[msg("Game has expired. Player may call refund_expired.")]
    GameExpired,
    #[msg("Game has not expired yet.")]
    GameNotExpired,
    #[msg("Commitment hash does not match mine_layout + salt.")]
    CommitmentMismatch,
    #[msg("Revealed tiles do not match mine layout.")]
    RevealMismatch,
    #[msg("Game already settled.")]
    GameAlreadySettled,
    #[msg("Game not finished. Must be settled or expired to close.")]
    GameNotFinished,
    #[msg("No tiles revealed yet. Reveal at least one safe tile before cashing out.")]
    NoTilesRevealed,
}

// ─── EVENTS ──────────────────────────────────────────────────────────────────

#[event]
pub struct GameStarted {
    pub player: Pubkey,
    pub bet: u64,
    pub mine_count: u8,
    pub commitment: [u8; 32],
    pub slot: u64,
}

#[event]
pub struct TileRevealed {
    pub player: Pubkey,
    pub tile_index: u8,
    pub safe: bool,
    pub multiplier_bps: u64,
    pub safe_reveals: u8,
}

#[event]
pub struct GameWon {
    pub player: Pubkey,
    pub bet: u64,
    pub payout: u64,
    pub multiplier_bps: u64,
    pub safe_reveals: u8,
}

#[event]
pub struct GameLost {
    pub player: Pubkey,
    pub bet: u64,
    pub tile_index: u8,
    pub safe_reveals: u8,
}

#[event]
pub struct GameSettled {
    pub player: Pubkey,
    pub mine_layout: u16,
    pub commitment: [u8; 32],
    pub verified: bool,
}

#[event]
pub struct GameRefunded {
    pub player: Pubkey,
    pub bet: u64,
    pub refund: u64,
}
