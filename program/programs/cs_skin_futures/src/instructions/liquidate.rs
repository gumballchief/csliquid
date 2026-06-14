use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount, Transfer},
};

use crate::{
    errors::FuturesError,
    math::calc_funding_owed,
    oracle::get_price,
    state::{LiquidityPool, Market, Position, PriceFeed, UserAccount, Vault},
};

/// Liquidation bonus: 5% of collateral transferred to the liquidator.
const LIQUIDATOR_BONUS_BPS: u64 = 500;
const BPS_DENOM: u64 = 10_000;

#[derive(Accounts)]
pub struct Liquidate<'info> {
    /// Anyone can call liquidate — open to all.
    #[account(mut)]
    pub liquidator: Signer<'info>,

    /// Liquidator's USDC ATA — receives the 5% bonus (created if absent).
    #[account(
        init_if_needed,
        payer                       = liquidator,
        associated_token::mint      = usdc_mint,
        associated_token::authority = liquidator,
    )]
    pub liquidator_usdc_account: Box<Account<'info, TokenAccount>>,

    /// Position owner's account — position removed from registry.
    /// Seeds: [b"user_account", position.owner]
    #[account(
        mut,
        seeds = [b"user_account", position.owner.as_ref()],
        bump  = owner_account.bump,
    )]
    pub owner_account: Box<Account<'info, UserAccount>>,

    /// Seeds: [b"market", market.price_feed]
    #[account(
        mut,
        seeds = [b"market", market.price_feed.as_ref()],
        bump  = market.bump,
    )]
    pub market: Box<Account<'info, Market>>,

    /// Underwater position to liquidate.
    /// Rent returned to liquidator when account closes.
    /// Seeds: [b"position", position.owner, market]
    #[account(
        mut,
        close  = liquidator,
        seeds  = [b"position", position.owner.as_ref(), market.key().as_ref()],
        bump   = position.bump,
        constraint = position.market == market.key() @ FuturesError::Unauthorized,
    )]
    pub position: Box<Account<'info, Position>>,

    /// Protocol USDC SPL vault — source of liquidation bonus.
    /// Seeds: [b"vault", usdc_mint]
    #[account(
        mut,
        seeds = [b"vault", usdc_mint.key().as_ref()],
        bump,
    )]
    pub vault_token: Box<Account<'info, TokenAccount>>,

    /// Protocol liquidity data account.
    /// Seeds: [b"vault"]
    #[account(
        mut,
        seeds = [b"vault"],
        bump  = vault_data.bump,
    )]
    pub vault_data: Box<Account<'info, Vault>>,

    /// Vault authority PDA — signs vault → liquidator transfer.
    /// CHECK: verified by seeds + bump.
    #[account(
        seeds = [b"vault_authority"],
        bump,
    )]
    pub vault_authority: UncheckedAccount<'info>,

    /// Protocol PriceFeed — must match `market.price_feed`.
    #[account(
        constraint = price_feed.key() == market.price_feed @ FuturesError::InvalidPrice
    )]
    pub price_feed: Box<Account<'info, PriceFeed>>,

    /// Global liquidity pool — absorbs the liquidated collateral (minus bonus).
    /// Seeds: [b"liquidity_pool"]
    #[account(
        mut,
        seeds = [b"liquidity_pool"],
        bump  = liquidity_pool.bump,
    )]
    pub liquidity_pool: Box<Account<'info, LiquidityPool>>,

    pub usdc_mint:                Account<'info, Mint>,
    pub token_program:            Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program:           Program<'info, System>,
}

pub fn handler(ctx: Context<Liquidate>) -> Result<()> {
    let clock = Clock::get()?;

    // ── Current price from PriceFeed (staleness guard inside get_price) ───────
    let mark_price = get_price(&ctx.accounts.price_feed, &clock)?;

    // Snapshot position fields before splitting borrows.
    let position_key        = ctx.accounts.position.key();
    let is_long             = ctx.accounts.position.is_long;
    let notional            = ctx.accounts.position.notional;
    let collateral          = ctx.accounts.position.collateral;
    let liquidation_price   = ctx.accounts.position.liquidation_price;
    let owner               = ctx.accounts.position.owner;
    let entry_funding_index = ctx.accounts.position.entry_funding_index;
    let cumulative_funding  = ctx.accounts.market.cumulative_funding;

    // ── Liquidation check ─────────────────────────────────────────────────────
    // Long:  mark ≤ liq_price  (price fell below entry by MMR)
    // Short: mark ≥ liq_price  (price rose above entry by MMR)
    let is_liq = if is_long {
        mark_price <= liquidation_price
    } else {
        mark_price >= liquidation_price
    };
    require!(is_liq, FuturesError::PositionNotLiquidatable);

    // ── Accrued funding (informational) ──────────────────────────────────────
    let index_delta          = cumulative_funding.wrapping_sub(entry_funding_index);
    let funding_owed         = calc_funding_owed(is_long, index_delta, notional)
        .unwrap_or(0);

    // ── Bonus: 5% of collateral ───────────────────────────────────────────────
    let bonus = collateral
        .checked_mul(LIQUIDATOR_BONUS_BPS)
        .ok_or_else(|| error!(FuturesError::MathOverflow))?
        .checked_div(BPS_DENOM)
        .ok_or_else(|| error!(FuturesError::MathOverflow))?;

    // ── SPL transfer: vault → liquidator USDC ATA ─────────────────────────────
    if bonus > 0 {
        let bump = ctx.bumps.vault_authority;
        let signer_seeds: &[&[&[u8]]] = &[&[b"vault_authority", &[bump]]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from:      ctx.accounts.vault_token.to_account_info(),
                    to:        ctx.accounts.liquidator_usdc_account.to_account_info(),
                    authority: ctx.accounts.vault_authority.to_account_info(),
                },
                signer_seeds,
            ),
            bonus,
        )?;
    }

    // ── State mutations ───────────────────────────────────────────────────────

    ctx.accounts.vault_data.total_liquidity =
        ctx.accounts.vault_data.total_liquidity.saturating_sub(bonus);

    // Pool absorbs the trader's collateral minus the liquidator bonus.
    // Opening taker_fee was already credited at open_position.
    let pool_gain = collateral.saturating_sub(bonus);
    let pool = &mut ctx.accounts.liquidity_pool;
    pool.total_usdc      = pool.total_usdc.saturating_add(pool_gain);
    pool.trader_pnl_paid = pool.trader_pnl_paid.saturating_sub(collateral as i64);

    let market = &mut ctx.accounts.market;
    if is_long {
        market.total_long_open_interest = market.total_long_open_interest.saturating_sub(notional);
    } else {
        market.total_short_open_interest = market.total_short_open_interest.saturating_sub(notional);
    }

    ctx.accounts.owner_account.positions.retain(|p| *p != position_key);

    msg!(
        "Liquidated @ {} | owner={} collateral={} bonus={} funding={}",
        mark_price, owner, collateral, bonus, funding_owed,
    );
    Ok(())
}
