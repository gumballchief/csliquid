use anchor_lang::prelude::*;

use crate::{
    errors::FuturesError,
    math::*,
    oracle::get_price,
    state::{LiquidityPool, Market, Position, PriceFeed, UserAccount},
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct OpenPositionParams {
    pub is_long:         bool,
    pub collateral:      u64,
    pub leverage:        u8,
    pub max_entry_price: u64,
}

#[derive(Accounts)]
pub struct OpenPosition<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    /// User must have deposited first — account is required to exist.
    /// Seeds: [b"user_account", owner]
    #[account(
        mut,
        seeds   = [b"user_account", owner.key().as_ref()],
        bump    = user_account.bump,
        has_one = owner @ FuturesError::Unauthorized,
    )]
    pub user_account: Box<Account<'info, UserAccount>>,

    /// Seeds: [b"market", market.price_feed]
    #[account(
        mut,
        seeds = [b"market", market.price_feed.as_ref()],
        bump  = market.bump,
    )]
    pub market: Box<Account<'info, Market>>,

    /// New position PDA — one per (owner, market) pair.
    /// Seeds: [b"position", owner, market]
    #[account(
        init,
        payer = owner,
        space = 8 + Position::INIT_SPACE,
        seeds = [b"position", owner.key().as_ref(), market.key().as_ref()],
        bump,
    )]
    pub position: Box<Account<'info, Position>>,

    /// Protocol PriceFeed for this market.
    #[account(
        constraint = price_feed.key() == market.price_feed @ FuturesError::InvalidPrice
    )]
    pub price_feed: Box<Account<'info, PriceFeed>>,

    /// Global liquidity pool — credited with the taker fee.
    /// Seeds: [b"liquidity_pool"]
    #[account(
        mut,
        seeds = [b"liquidity_pool"],
        bump  = liquidity_pool.bump,
    )]
    pub liquidity_pool: Box<Account<'info, LiquidityPool>>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<OpenPosition>, params: OpenPositionParams) -> Result<()> {
    let OpenPositionParams { is_long, collateral, leverage, max_entry_price } = params;
    let clock = Clock::get()?;

    require!(collateral > 0, FuturesError::InvalidCollateral);
    require!(leverage >= 1 && leverage <= 20, FuturesError::InvalidLeverage);

    let entry_price = get_price(&ctx.accounts.price_feed, &clock)?;
    require!(entry_price <= max_entry_price, FuturesError::PriceSlippage);

    let notional = (collateral as u128)
        .checked_mul(leverage as u128)
        .ok_or_else(|| error!(FuturesError::MathOverflow))? as u64;
    let size              = calc_size(notional, entry_price)?;
    let taker_fee         = calc_taker_fee(notional)?;
    let liquidation_price = calc_liquidation_price(is_long, entry_price, leverage)?;
    let total_cost        = collateral
        .checked_add(taker_fee)
        .ok_or_else(|| error!(FuturesError::MathOverflow))?;

    // Deduct from the user's vault balance — no SPL transfer needed.
    let ua = &mut ctx.accounts.user_account;
    require!(ua.usdc_balance >= total_cost, FuturesError::InsufficientBalance);
    ua.usdc_balance = ua
        .usdc_balance
        .checked_sub(total_cost)
        .ok_or_else(|| error!(FuturesError::MathUnderflow))?;
    let position_key = ctx.accounts.position.key();
    ua.positions.push(position_key);

    let market = &mut ctx.accounts.market;
    if is_long {
        market.total_long_open_interest = market.total_long_open_interest
            .checked_add(notional)
            .ok_or_else(|| error!(FuturesError::MathOverflow))?;
    } else {
        market.total_short_open_interest = market.total_short_open_interest
            .checked_add(notional)
            .ok_or_else(|| error!(FuturesError::MathOverflow))?;
    }
    let cumulative_funding_at_open = market.cumulative_funding;

    let position = &mut ctx.accounts.position;
    position.owner               = ctx.accounts.owner.key();
    position.market              = market.key();
    position.is_long             = is_long;
    position.collateral          = collateral;
    position.size                = size;
    position.notional            = notional;
    position.entry_price         = entry_price;
    position.liquidation_price   = liquidation_price;
    position.opened_at           = clock.unix_timestamp;
    position.entry_funding_index = cumulative_funding_at_open;
    position.bump                = ctx.bumps.position;

    let pool = &mut ctx.accounts.liquidity_pool;
    pool.total_usdc = pool.total_usdc
        .checked_add(taker_fee)
        .ok_or_else(|| error!(FuturesError::MathOverflow))?;
    pool.fees_earned = pool.fees_earned
        .checked_add(taker_fee)
        .ok_or_else(|| error!(FuturesError::MathOverflow))?;

    msg!(
        "{} {} units @ {} | collateral={} fee={} liq={}",
        if is_long { "LONG" } else { "SHORT" },
        size, entry_price, collateral, taker_fee, liquidation_price,
    );
    Ok(())
}
