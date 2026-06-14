use anchor_lang::prelude::*;

use crate::state::Market;

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitializeMarketParams {
    /// Human-readable skin name (e.g. "AK-47 | Redline (Field-Tested)").
    pub skin_id: String,
    /// Off-chain price oracle pubkey; used as the PDA seed for this market.
    pub price_feed: Pubkey,
}

#[derive(Accounts)]
#[instruction(params: InitializeMarketParams)]
pub struct InitializeMarket<'info> {
    /// Protocol authority; payer for market account rent.
    #[account(mut)]
    pub authority: Signer<'info>,

    /// Market PDA — one per skin, seeded by price_feed pubkey.
    /// Seeds: [b"market", price_feed]
    #[account(
        init,
        payer  = authority,
        space  = 8 + Market::INIT_SPACE,
        seeds  = [b"market", params.price_feed.as_ref()],
        bump,
    )]
    pub market: Account<'info, Market>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializeMarket>, params: InitializeMarketParams) -> Result<()> {
    let market = &mut ctx.accounts.market;
    let clock  = Clock::get()?;

    market.authority                 = ctx.accounts.authority.key();
    market.skin_id                   = params.skin_id.clone();
    market.price_feed                = params.price_feed;
    market.total_long_open_interest  = 0;
    market.total_short_open_interest = 0;
    market.funding_rate              = 0;
    market.cumulative_funding        = 0;
    market.last_funding_rate_update  = clock.unix_timestamp;
    market.last_funding_time         = clock.unix_timestamp;
    market.bump                      = ctx.bumps.market;

    msg!("Market initialised: '{}', price_feed={}", params.skin_id, params.price_feed);
    Ok(())
}
