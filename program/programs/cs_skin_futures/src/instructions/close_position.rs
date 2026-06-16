use anchor_lang::prelude::*;

use crate::{
    errors::FuturesError,
    math::*,
    oracle::get_price,
    state::{LiquidityPool, Market, Position, PriceFeed, UserAccount},
};

#[derive(Accounts)]
pub struct ClosePosition<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

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

    /// The position to close. Rent returned to owner at end of instruction.
    /// Seeds: [b"position", owner, market]
    #[account(
        mut,
        close  = owner,
        seeds  = [b"position", owner.key().as_ref(), market.key().as_ref()],
        bump   = position.bump,
        constraint = position.owner == owner.key() @ FuturesError::PositionOwnerMismatch,
    )]
    pub position: Box<Account<'info, Position>>,

    /// Protocol PriceFeed — must match `market.price_feed`.
    #[account(
        constraint = price_feed.key() == market.price_feed @ FuturesError::InvalidPrice
    )]
    pub price_feed: Box<Account<'info, PriceFeed>>,

    /// Global liquidity pool — updated as counterparty to this trade.
    /// Seeds: [b"liquidity_pool"]
    #[account(
        mut,
        seeds = [b"liquidity_pool"],
        bump  = liquidity_pool.bump,
    )]
    pub liquidity_pool: Box<Account<'info, LiquidityPool>>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<ClosePosition>) -> Result<()> {
    let clock = Clock::get()?;

    let exit_price = get_price(&ctx.accounts.price_feed, &clock)?;

    let position_key        = ctx.accounts.position.key();
    let is_long             = ctx.accounts.position.is_long;
    let size                = ctx.accounts.position.size;
    let notional            = ctx.accounts.position.notional;
    let entry_price         = ctx.accounts.position.entry_price;
    let collateral          = ctx.accounts.position.collateral;
    let entry_funding_index = ctx.accounts.position.entry_funding_index;
    let cumulative_funding  = ctx.accounts.market.cumulative_funding;

    let gross_pnl   = calc_unrealized_pnl(is_long, size, entry_price, exit_price)?;
    let closing_fee = calc_taker_fee(notional)?;

    let index_delta  = cumulative_funding.wrapping_sub(entry_funding_index);
    let funding_owed = calc_funding_owed(is_long, index_delta, notional)?;

    // net_return = collateral + gross_pnl − closing_fee − funding_owed, clamped ≥ 0.
    let net_return = {
        let raw = (collateral as i64)
            .checked_add(gross_pnl)
            .ok_or_else(|| error!(FuturesError::MathOverflow))?
            .checked_sub(closing_fee as i64)
            .ok_or_else(|| error!(FuturesError::MathUnderflow))?
            .checked_sub(funding_owed)
            .ok_or_else(|| error!(FuturesError::MathUnderflow))?;
        raw.max(0) as u64
    };

    // Credit net_return to the user's vault balance — no SPL transfer needed.
    ctx.accounts.user_account.usdc_balance = ctx.accounts.user_account.usdc_balance
        .saturating_add(net_return);

    // Pool counterparty accounting:
    //   pool_delta = collateral − net_return
    //   > 0: trader lost (or paid fees/funding) → pool gained
    //   < 0: trader profited more than fees     → pool paid the difference
    let pool_delta: i64 = (collateral as i64) - (net_return as i64);
    let pool = &mut ctx.accounts.liquidity_pool;
    if pool_delta >= 0 {
        pool.total_usdc = pool.total_usdc.saturating_add(pool_delta as u64);
    } else {
        pool.total_usdc = pool.total_usdc.saturating_sub((-pool_delta) as u64);
    }
    pool.fees_earned     = pool.fees_earned.saturating_add(closing_fee);
    pool.trader_pnl_paid = pool.trader_pnl_paid.saturating_add(gross_pnl);

    let market = &mut ctx.accounts.market;
    if is_long {
        market.total_long_open_interest = market.total_long_open_interest.saturating_sub(notional);
    } else {
        market.total_short_open_interest = market.total_short_open_interest.saturating_sub(notional);
    }

    ctx.accounts.user_account.positions.retain(|p| *p != position_key);

    msg!(
        "Closed entry={} exit={} size={} gross_pnl={} fee={} funding={} returned={}",
        entry_price, exit_price, size, gross_pnl, closing_fee, funding_owed, net_return,
    );
    Ok(())
}
