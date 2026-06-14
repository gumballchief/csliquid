use anchor_lang::prelude::*;

use crate::{errors::FuturesError, state::PriceFeed};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct PushPriceParams {
    /// Current index price from the oracle service (6 decimals, USDC).
    /// $1.00 → 1_000_000.
    pub price: u64,
}

#[derive(Accounts)]
pub struct PushPrice<'info> {
    /// Must match `price_feed.authority`.  No rent charged — authority is
    /// the fee-payer of the transaction and account is already initialised.
    pub authority: Signer<'info>,

    /// The feed to update.  Constraint ensures only the registered authority
    /// can write prices — any other signer is rejected.
    #[account(
        mut,
        constraint = price_feed.authority == authority.key() @ FuturesError::Unauthorized,
    )]
    pub price_feed: Account<'info, PriceFeed>,
}

pub fn handler(ctx: Context<PushPrice>, params: PushPriceParams) -> Result<()> {
    require!(params.price > 0, FuturesError::InvalidPrice);

    let feed          = &mut ctx.accounts.price_feed;
    feed.price        = params.price;
    // published_at is set from the on-chain clock so callers cannot forge freshness.
    feed.published_at = Clock::get()?.unix_timestamp;

    msg!(
        "PriceFeed updated — price={} published_at={}",
        feed.price, feed.published_at,
    );
    Ok(())
}
