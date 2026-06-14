use anchor_lang::prelude::*;

use crate::state::PriceFeed;

#[derive(Accounts)]
#[instruction(skin_id: String)]
pub struct InitializePriceFeed<'info> {
    /// Protocol admin — pays rent, becomes feed authority.
    #[account(mut)]
    pub authority: Signer<'info>,

    /// PDA seeds: [b"price_feed", skin_id.as_bytes()]
    /// One feed per index (awp-index, ak47-index, knife-index, glove-index).
    #[account(
        init,
        payer = authority,
        space = 8 + PriceFeed::INIT_SPACE,
        seeds = [b"price_feed", skin_id.as_bytes()],
        bump,
    )]
    pub price_feed: Account<'info, PriceFeed>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializePriceFeed>, skin_id: String) -> Result<()> {
    let feed        = &mut ctx.accounts.price_feed;
    feed.authority  = ctx.accounts.authority.key();
    feed.price      = 0;
    feed.published_at = 0;
    feed.bump       = ctx.bumps.price_feed;

    msg!("PriceFeed initialised — skin_id={} pda={}", skin_id, ctx.accounts.price_feed.key());
    Ok(())
}
