//! # CS Skin Perpetual Futures — Solana Program
//!
//! An Anchor-based perpetual futures protocol where each CS2 skin index is
//! its own isolated market.  Positions use USDC as collateral (isolated margin).
//!
//! ## Program accounts
//!
//! | Account           | PDA seeds                              | Description                          |
//! |-------------------|----------------------------------------|--------------------------------------|
//! | `PriceFeed`       | `[b"price_feed", skin_id.as_bytes()]`  | Trusted price written by admin pusher |
//! | `Market`          | `[b"market", price_feed]`              | Per-index perpetuals market           |
//! | `UserAccount`     | `[b"user_account", owner]`             | Per-user USDC balance & position list |
//! | `Position`        | `[b"position", owner, market]`         | Single open position (1 per market)   |
//! | `Vault` (data)    | `[b"vault"]`                           | Protocol liquidity tracker            |
//! | vault (SPL)       | `[b"vault", usdc_mint]`                | Protocol USDC token account           |
//! | `vault_authority` | `[b"vault_authority"]`                 | PDA that signs vault→user transfers   |
//!
//! ## Instruction flow
//!
//! ```text
//! authority → initialize_price_feed    (one-time per index)
//! authority → initialize_market        (one-time per index, refs price_feed PDA)
//! scripts   → push_price              (every ~60 s, prices from oracle service)
//! user      → deposit
//! authority → update_oracle            (funding rate update, called by keeper)
//! user      → open_position            (long / short — reads PriceFeed)
//! authority → apply_funding            (every 8 h, keeper crank)
//! user      → close_position           (voluntary close — reads PriceFeed)
//! anyone    → liquidate                (when mark_price crosses liq_price)
//! user      → withdraw
//! ```

use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod math;
pub mod oracle;
pub mod state;

use instructions::{
    add_liquidity::*, apply_funding::*, close_position::*, deposit::*,
    initialize_market::*, initialize_pool::*, initialize_price_feed::*, initialize_vault::*,
    initialize_vault_token::*,
    liquidate::*, open_position::*, push_price::*, remove_liquidity::*,
    update_funding_rate::*, update_oracle::*, withdraw::*,
};

declare_id!("76QQzNaRCjcF83bf3Bx6XN67eHbthDETKdLSVccfXf9f");

#[program]
pub mod cs_skin_futures {
    use super::*;

    // ── Oracle / price feed ───────────────────────────────────────────────────

    /// One-time setup: create the on-chain PriceFeed account for an index.
    /// Must be called before `initialize_market` for the same index.
    pub fn initialize_price_feed(
        ctx: Context<InitializePriceFeed>,
        skin_id: String,
    ) -> Result<()> {
        instructions::initialize_price_feed::handler(ctx, skin_id)
    }

    /// Push a fresh VWAP price from the oracle service.  Only the registered
    /// authority keypair can call this.  `published_at` is set by the
    /// on-chain clock — callers cannot forge freshness.
    pub fn push_price(ctx: Context<PushPrice>, params: PushPriceParams) -> Result<()> {
        instructions::push_price::handler(ctx, params)
    }

    // ── Market lifecycle ──────────────────────────────────────────────────────

    pub fn initialize_market(
        ctx: Context<InitializeMarket>,
        params: InitializeMarketParams,
    ) -> Result<()> {
        instructions::initialize_market::handler(ctx, params)
    }

    /// Push mark + index price manually; recomputes the funding rate.
    pub fn update_oracle(
        ctx: Context<UpdateOracle>,
        params: UpdateOracleParams,
    ) -> Result<()> {
        instructions::update_oracle::handler(ctx, params)
    }

    // ── User account ──────────────────────────────────────────────────────────

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        instructions::deposit::handler(ctx, amount)
    }

    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        instructions::withdraw::handler(ctx, amount)
    }

    // ── Trading ───────────────────────────────────────────────────────────────

    pub fn open_position(
        ctx: Context<OpenPosition>,
        params: OpenPositionParams,
    ) -> Result<()> {
        instructions::open_position::handler(ctx, params)
    }

    /// Close at the live oracle price.  Reverts if PriceFeed is stale (> 2 min).
    pub fn close_position(ctx: Context<ClosePosition>) -> Result<()> {
        instructions::close_position::handler(ctx)
    }

    // ── Keeper instructions ───────────────────────────────────────────────────

    pub fn apply_funding(
        ctx: Context<ApplyFunding>,
        params: ApplyFundingParams,
    ) -> Result<()> {
        instructions::apply_funding::handler(ctx, params)
    }

    /// Liquidate an underwater position using the live PriceFeed price.
    pub fn liquidate(ctx: Context<Liquidate>) -> Result<()> {
        instructions::liquidate::handler(ctx)
    }

    /// Permissionless crank — anyone can call once per hour.
    pub fn update_funding_rate(ctx: Context<UpdateFundingRate>) -> Result<()> {
        instructions::update_funding_rate::handler(ctx)
    }

    // ── Liquidity pool ────────────────────────────────────────────────────────

    /// One-time setup: create the vault data + SPL token accounts.
    /// Must be called before deposit, open_position, or add_liquidity.
    pub fn initialize_vault(ctx: Context<InitializeVault>) -> Result<()> {
        instructions::initialize_vault::handler(ctx)
    }

    /// Add a vault token account for an additional USDC mint (e.g. devnet test mint).
    /// vault_data must already exist; only the token account is created.
    pub fn initialize_vault_token(ctx: Context<InitializeVaultToken>) -> Result<()> {
        instructions::initialize_vault_token::handler(ctx)
    }

    /// One-time setup: create the global LiquidityPool account.
    /// Must be called before any add_liquidity deposits.
    pub fn initialize_pool(ctx: Context<InitializePool>) -> Result<()> {
        instructions::initialize_pool::handler(ctx)
    }

    /// Deposit USDC into the pool and receive LP tokens proportional to
    /// the current pool share.  Resets the 24-hour withdrawal cooldown.
    pub fn add_liquidity(ctx: Context<AddLiquidity>, amount: u64) -> Result<()> {
        instructions::add_liquidity::handler(ctx, amount)
    }

    /// Burn LP tokens and withdraw proportional USDC.
    /// Enforces a 24-hour cooldown after the most recent deposit.
    pub fn remove_liquidity(ctx: Context<RemoveLiquidity>, lp_tokens: u64) -> Result<()> {
        instructions::remove_liquidity::handler(ctx, lp_tokens)
    }
}
