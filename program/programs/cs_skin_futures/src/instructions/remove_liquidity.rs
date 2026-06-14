use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount, Transfer},
};

use crate::{
    errors::FuturesError,
    state::{LiquidityPool, LpPosition, Vault},
};

/// 24-hour cooldown enforced after any add_liquidity call.
/// Prevents LPs from front-running large trades: deposit just before a
/// guaranteed winning trade, capture the PnL, then immediately withdraw.
pub const LP_COOLDOWN_SECONDS: i64 = 86_400;

#[derive(Accounts)]
pub struct RemoveLiquidity<'info> {
    /// LP owner — must be the original depositor.
    #[account(mut)]
    pub owner: Signer<'info>,

    /// LP position being redeemed.
    /// Seeds: [b"lp_position", owner]
    #[account(
        mut,
        seeds  = [b"lp_position", owner.key().as_ref()],
        bump   = lp_position.bump,
        constraint = lp_position.owner == owner.key() @ FuturesError::Unauthorized,
    )]
    pub lp_position: Account<'info, LpPosition>,

    /// Global pool state.
    /// Seeds: [b"liquidity_pool"]
    #[account(
        mut,
        seeds = [b"liquidity_pool"],
        bump  = liquidity_pool.bump,
    )]
    pub liquidity_pool: Account<'info, LiquidityPool>,

    /// Owner's USDC ATA — receives the withdrawn USDC (created if absent).
    #[account(
        init_if_needed,
        payer                       = owner,
        associated_token::mint      = usdc_mint,
        associated_token::authority = owner,
    )]
    pub user_usdc_account: Account<'info, TokenAccount>,

    /// Protocol USDC SPL vault — source of the withdrawal.
    /// Seeds: [b"vault", usdc_mint]
    #[account(
        mut,
        seeds = [b"vault", usdc_mint.key().as_ref()],
        bump,
    )]
    pub vault_token: Account<'info, TokenAccount>,

    /// Protocol liquidity data account.
    /// Seeds: [b"vault"]
    #[account(
        mut,
        seeds = [b"vault"],
        bump  = vault_data.bump,
    )]
    pub vault_data: Account<'info, Vault>,

    /// Vault signing authority — signs the vault → owner transfer.
    /// CHECK: verified by seeds + bump.
    #[account(seeds = [b"vault_authority"], bump)]
    pub vault_authority: UncheckedAccount<'info>,

    pub usdc_mint:                Account<'info, Mint>,
    pub token_program:            Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program:           Program<'info, System>,
}

pub fn handler(ctx: Context<RemoveLiquidity>, lp_tokens: u64) -> Result<()> {
    require!(lp_tokens > 0, FuturesError::InvalidCollateral);

    // Snapshot before mutable borrows.
    let deposited_at       = ctx.accounts.lp_position.deposited_at;
    let current_lp_balance = ctx.accounts.lp_position.lp_tokens;
    let pool_total_usdc    = ctx.accounts.liquidity_pool.total_usdc;
    let pool_lp_supply     = ctx.accounts.liquidity_pool.lp_supply;

    let clock = Clock::get()?;

    // 24-hour cooldown check — prevents LP front-running.
    let elapsed = clock.unix_timestamp.saturating_sub(deposited_at);
    require!(elapsed >= LP_COOLDOWN_SECONDS, FuturesError::LpCooldownActive);

    // Balance check.
    require!(current_lp_balance >= lp_tokens, FuturesError::InsufficientLpTokens);

    // Compute USDC to return: proportional share of pool.
    let usdc_out: u64 = (lp_tokens as u128)
        .checked_mul(pool_total_usdc as u128)
        .ok_or_else(|| error!(FuturesError::MathOverflow))?
        .checked_div(pool_lp_supply as u128)
        .ok_or_else(|| error!(FuturesError::MathOverflow))? as u64;

    require!(usdc_out > 0, FuturesError::InsufficientBalance);
    require!(pool_total_usdc >= usdc_out, FuturesError::InsufficientPoolLiquidity);

    // Transfer USDC: vault → owner wallet (signed by vault_authority PDA).
    let bump = ctx.bumps.vault_authority;
    let signer_seeds: &[&[&[u8]]] = &[&[b"vault_authority", &[bump]]];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from:      ctx.accounts.vault_token.to_account_info(),
                to:        ctx.accounts.user_usdc_account.to_account_info(),
                authority: ctx.accounts.vault_authority.to_account_info(),
            },
            signer_seeds,
        ),
        usdc_out,
    )?;

    // Update vault tracker.
    ctx.accounts.vault_data.total_liquidity =
        ctx.accounts.vault_data.total_liquidity.saturating_sub(usdc_out);

    // Update pool.
    let pool = &mut ctx.accounts.liquidity_pool;
    pool.total_usdc = pool.total_usdc.saturating_sub(usdc_out);
    pool.lp_supply  = pool.lp_supply.saturating_sub(lp_tokens);

    // Update LP position.
    ctx.accounts.lp_position.lp_tokens =
        ctx.accounts.lp_position.lp_tokens.saturating_sub(lp_tokens);

    msg!(
        "RemoveLiquidity: {} LP tokens → {} USDC (pool_total={} lp_supply={})",
        lp_tokens, usdc_out, pool.total_usdc, pool.lp_supply,
    );
    Ok(())
}
