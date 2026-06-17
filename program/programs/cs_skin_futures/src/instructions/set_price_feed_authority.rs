use anchor_lang::prelude::*;

use crate::{errors::FuturesError, state::PriceFeed};

#[derive(Accounts)]
pub struct SetPriceFeedAuthority<'info> {
    /// Current feed authority — must sign to transfer ownership.
    pub authority: Signer<'info>,

    /// The feed whose authority is being transferred.
    #[account(
        mut,
        constraint = price_feed.authority == authority.key() @ FuturesError::Unauthorized,
    )]
    pub price_feed: Account<'info, PriceFeed>,
}

pub fn handler(ctx: Context<SetPriceFeedAuthority>, new_authority: Pubkey) -> Result<()> {
    ctx.accounts.price_feed.authority = new_authority;
    msg!("PriceFeed authority → {}", new_authority);
    Ok(())
}
