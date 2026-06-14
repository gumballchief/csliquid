use anchor_lang::prelude::*;

use crate::{errors::FuturesError, state::Market};

/// OI-based funding rate: positive → longs pay, negative → shorts pay.
/// Rate is expressed in units of FUNDING_RATE_SCALE (1e8).
/// At full imbalance (all longs or all shorts) the rate is BASE_RATE per hour.
const BASE_RATE: i128 = 10_000; // 0.01% per hour at full imbalance

#[derive(Accounts)]
pub struct UpdateFundingRate<'info> {
    /// Permissionless — any caller can crank this.
    #[account(
        mut,
        seeds = [b"market", market.price_feed.as_ref()],
        bump  = market.bump,
    )]
    pub market: Account<'info, Market>,
}

pub fn handler(ctx: Context<UpdateFundingRate>) -> Result<()> {
    let clock = Clock::get()?;
    let market = &mut ctx.accounts.market;

    require!(
        clock.unix_timestamp >= market.last_funding_rate_update + Market::FUNDING_RATE_INTERVAL,
        FuturesError::FundingTooEarly,
    );

    let long_oi  = market.total_long_open_interest as i128;
    let short_oi = market.total_short_open_interest as i128;
    let total_oi = long_oi + short_oi;

    let new_rate: i64 = if total_oi == 0 {
        0
    } else {
        let imbalance = long_oi - short_oi; // signed: positive = more longs
        let rate = imbalance
            .checked_mul(BASE_RATE)
            .ok_or_else(|| error!(FuturesError::MathOverflow))?
            .checked_div(total_oi)
            .ok_or_else(|| error!(FuturesError::MathOverflow))?;
        i64::try_from(rate).map_err(|_| error!(FuturesError::MathOverflow))?
    };

    market.funding_rate = new_rate;
    market.cumulative_funding = market.cumulative_funding
        .checked_add(new_rate as i128)
        .ok_or_else(|| error!(FuturesError::MathOverflow))?;
    market.last_funding_rate_update = clock.unix_timestamp;

    msg!(
        "Funding updated: rate={} cumulative={}",
        new_rate, market.cumulative_funding,
    );
    Ok(())
}
