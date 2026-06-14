use anchor_lang::prelude::*;

use crate::state::LiquidityPool;

#[derive(Accounts)]
pub struct InitializePool<'info> {
    /// Protocol authority — pays rent and becomes pool.authority.
    #[account(mut)]
    pub authority: Signer<'info>,

    /// Global pool state — one per protocol.
    /// Seeds: [b"liquidity_pool"]
    #[account(
        init,
        payer  = authority,
        space  = 8 + LiquidityPool::INIT_SPACE,
        seeds  = [b"liquidity_pool"],
        bump,
    )]
    pub liquidity_pool: Account<'info, LiquidityPool>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializePool>) -> Result<()> {
    let pool = &mut ctx.accounts.liquidity_pool;
    pool.authority       = ctx.accounts.authority.key();
    pool.total_usdc      = 0;
    pool.lp_supply       = 0;
    pool.fees_earned     = 0;
    pool.trader_pnl_paid = 0;
    pool.inception_ts    = Clock::get()?.unix_timestamp;
    pool.bump            = ctx.bumps.liquidity_pool;

    msg!("LiquidityPool initialized by {}", pool.authority);
    Ok(())
}
