use anchor_lang::prelude::*;

use crate::{errors::FuturesError, state::Market};

#[derive(Accounts)]
pub struct SetMarketAuthority<'info> {
    /// Current market authority — must sign to transfer ownership.
    pub authority: Signer<'info>,

    /// The market whose authority is being transferred.
    #[account(
        mut,
        constraint = market.authority == authority.key() @ FuturesError::Unauthorized,
    )]
    pub market: Account<'info, Market>,
}

pub fn handler(ctx: Context<SetMarketAuthority>, new_authority: Pubkey) -> Result<()> {
    ctx.accounts.market.authority = new_authority;
    msg!("Market authority → {}", new_authority);
    Ok(())
}
