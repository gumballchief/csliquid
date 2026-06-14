use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::{
    errors::FuturesError,
    state::{LiquidityPool, LpPosition, Vault},
};

#[derive(Accounts)]
pub struct AddLiquidity<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    /// Per-user LP position — created on first deposit.
    /// Seeds: [b"lp_position", owner]
    #[account(
        init_if_needed,
        payer  = owner,
        space  = 8 + LpPosition::INIT_SPACE,
        seeds  = [b"lp_position", owner.key().as_ref()],
        bump,
    )]
    pub lp_position: Box<Account<'info, LpPosition>>,

    /// Global pool state.
    /// Seeds: [b"liquidity_pool"]
    #[account(
        mut,
        seeds = [b"liquidity_pool"],
        bump  = liquidity_pool.bump,
    )]
    pub liquidity_pool: Box<Account<'info, LiquidityPool>>,

    /// Owner's USDC ATA — source of deposited liquidity.
    #[account(
        mut,
        associated_token::mint      = usdc_mint,
        associated_token::authority = owner,
    )]
    pub user_usdc_account: Box<Account<'info, TokenAccount>>,

    /// Protocol USDC SPL vault (initialized once by initialize_vault).
    /// Seeds: [b"vault", usdc_mint]
    #[account(
        mut,
        seeds = [b"vault", usdc_mint.key().as_ref()],
        bump,
    )]
    pub vault_token: Box<Account<'info, TokenAccount>>,

    /// Protocol liquidity data account.
    /// Seeds: [b"vault"]
    #[account(
        mut,
        seeds = [b"vault"],
        bump  = vault_data.bump,
    )]
    pub vault_data: Box<Account<'info, Vault>>,

    pub usdc_mint:      Box<Account<'info, Mint>>,
    pub token_program:  Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<AddLiquidity>, amount: u64) -> Result<()> {
    require!(amount > 0, FuturesError::InvalidCollateral);

    let pool  = &ctx.accounts.liquidity_pool;
    let clock = Clock::get()?;

    let lp_to_mint: u64 = if pool.lp_supply == 0 || pool.total_usdc == 0 {
        amount
    } else {
        (amount as u128)
            .checked_mul(pool.lp_supply as u128)
            .ok_or_else(|| error!(FuturesError::MathOverflow))?
            .checked_div(pool.total_usdc as u128)
            .ok_or_else(|| error!(FuturesError::MathOverflow))? as u64
    };
    require!(lp_to_mint > 0, FuturesError::InvalidCollateral);

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from:      ctx.accounts.user_usdc_account.to_account_info(),
                to:        ctx.accounts.vault_token.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        ),
        amount,
    )?;

    ctx.accounts.vault_data.total_liquidity = ctx.accounts.vault_data.total_liquidity
        .checked_add(amount)
        .ok_or_else(|| error!(FuturesError::MathOverflow))?;

    let pool = &mut ctx.accounts.liquidity_pool;
    pool.total_usdc = pool.total_usdc
        .checked_add(amount)
        .ok_or_else(|| error!(FuturesError::MathOverflow))?;
    pool.lp_supply = pool.lp_supply
        .checked_add(lp_to_mint)
        .ok_or_else(|| error!(FuturesError::MathOverflow))?;

    let lp_pos = &mut ctx.accounts.lp_position;
    if lp_pos.bump == 0 {
        lp_pos.owner = ctx.accounts.owner.key();
        lp_pos.bump  = ctx.bumps.lp_position;
    }
    lp_pos.lp_tokens = lp_pos.lp_tokens
        .checked_add(lp_to_mint)
        .ok_or_else(|| error!(FuturesError::MathOverflow))?;
    lp_pos.deposited_at = clock.unix_timestamp;

    msg!(
        "AddLiquidity: {} USDC → {} LP tokens (pool_total={} lp_supply={})",
        amount, lp_to_mint, pool.total_usdc, pool.lp_supply,
    );
    Ok(())
}
