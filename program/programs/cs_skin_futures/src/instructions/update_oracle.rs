use anchor_lang::prelude::*;

use crate::{errors::FuturesError, state::Market};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct UpdateOracleParams {
    /// Current mark price (6 decimals, USDC).
    pub mark_price: u64,
    /// External index price from oracle (6 decimals, USDC).
    pub index_price: u64,
}

#[derive(Accounts)]
pub struct UpdateOracle<'info> {
    /// Must match `market.authority`.
    pub authority: Signer<'info>,

    /// Seeds: [b"market", market.price_feed]
    #[account(
        mut,
        seeds   = [b"market", market.price_feed.as_ref()],
        bump    = market.bump,
        has_one = authority @ FuturesError::Unauthorized,
    )]
    pub market: Account<'info, Market>,
}

pub fn handler(ctx: Context<UpdateOracle>, params: UpdateOracleParams) -> Result<()> {
    require!(params.mark_price  > 0, FuturesError::InvalidPrice);
    require!(params.index_price > 0, FuturesError::InvalidPrice);

    let market = &mut ctx.accounts.market;

    // funding_rate = (mark − index) / index × FUNDING_RATE_SCALE / 24
    // Dividing by 24 converts a daily spread to an 8-hour rate.
    // TODO: replace with a TWAP-based formula before mainnet.
    let mark  = params.mark_price  as i128;
    let index = params.index_price as i128;
    let scale = crate::math::FUNDING_RATE_SCALE as i128;
    let spread = (mark - index)
        .checked_mul(scale)
        .ok_or_else(|| error!(FuturesError::MathOverflow))?
        .checked_div(index)
        .ok_or_else(|| error!(FuturesError::MathOverflow))?
        .checked_div(24)
        .ok_or_else(|| error!(FuturesError::MathOverflow))?;
    market.funding_rate = spread as i64;

    msg!(
        "Oracle updated: mark={}, index={}, funding_rate={}",
        params.mark_price,
        params.index_price,
        market.funding_rate,
    );
    Ok(())
}
