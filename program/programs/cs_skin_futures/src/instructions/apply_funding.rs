use anchor_lang::prelude::*;

use crate::{
    errors::FuturesError,
    math::calc_funding_payment,
    state::{Market, Position, UserAccount},
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ApplyFundingParams {
    /// Current oracle mark price (6 decimals, USDC).
    pub mark_price: u64,
}

/// Apply one funding interval to a single position.
///
/// Called by a keeper bot every 8 hours per (market, position) pair.
/// Positive payment  → long position's balance is debited.
/// Negative payment → short position receives (currently not credited to avoid
///                    complexity; TODO: insurance fund credit).
#[derive(Accounts)]
pub struct ApplyFunding<'info> {
    /// Keeper bot or protocol authority.
    pub authority: Signer<'info>,

    /// Seeds: [b"market", market.price_feed]
    #[account(
        mut,
        seeds   = [b"market", market.price_feed.as_ref()],
        bump    = market.bump,
        has_one = authority @ FuturesError::Unauthorized,
    )]
    pub market: Account<'info, Market>,

    /// The position receiving the funding adjustment.
    /// Seeds: [b"position", position.owner, market]
    #[account(
        seeds = [b"position", position.owner.as_ref(), market.key().as_ref()],
        bump  = position.bump,
        constraint = position.market == market.key() @ FuturesError::Unauthorized,
    )]
    pub position: Account<'info, Position>,

    /// Owner's account; debited when funding is owed.
    /// Seeds: [b"user_account", position.owner]
    #[account(
        mut,
        seeds = [b"user_account", position.owner.as_ref()],
        bump  = owner_account.bump,
    )]
    pub owner_account: Account<'info, UserAccount>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<ApplyFunding>, params: ApplyFundingParams) -> Result<()> {
    let market        = &mut ctx.accounts.market;
    let position      = &ctx.accounts.position;
    let owner_account = &mut ctx.accounts.owner_account;
    let clock         = Clock::get()?;

    require!(
        clock.unix_timestamp >= market.last_funding_time + Market::FUNDING_INTERVAL,
        FuturesError::FundingNotDue
    );

    let payment = calc_funding_payment(
        position.is_long,
        position.size,
        params.mark_price,
        market.funding_rate,
    )?;

    // Positive payment = long owes; debit immediately, saturating at 0.
    if payment > 0 {
        owner_account.usdc_balance =
            owner_account.usdc_balance.saturating_sub(payment as u64);
    }
    // Negative payment = long receives (short owes) — TODO: credit via insurance fund.

    market.last_funding_time = clock.unix_timestamp;

    msg!("Funding applied: payment={}", payment);
    Ok(())
}
