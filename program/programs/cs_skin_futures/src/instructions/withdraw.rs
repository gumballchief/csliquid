use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount, Transfer},
};

use crate::{errors::FuturesError, state::{UserAccount, Vault}};

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    /// Seeds: [b"user_account", owner]
    #[account(
        mut,
        seeds   = [b"user_account", owner.key().as_ref()],
        bump    = user_account.bump,
        has_one = owner @ FuturesError::Unauthorized,
    )]
    pub user_account: Account<'info, UserAccount>,

    /// Destination: owner's USDC ATA (created if absent).
    #[account(
        init_if_needed,
        payer                       = owner,
        associated_token::mint      = usdc_mint,
        associated_token::authority = owner,
    )]
    pub user_usdc_account: Account<'info, TokenAccount>,

    /// Protocol USDC SPL vault (token account).
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

    /// Vault authority PDA; signs the vault → user transfer.
    /// CHECK: verified by seeds + bump.
    #[account(
        seeds = [b"vault_authority"],
        bump,
    )]
    pub vault_authority: UncheckedAccount<'info>,

    pub usdc_mint:                Account<'info, Mint>,
    pub token_program:            Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program:           Program<'info, System>,
}

pub fn handler(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
    require!(amount > 0, FuturesError::InvalidCollateral);
    require!(
        ctx.accounts.user_account.usdc_balance >= amount,
        FuturesError::WithdrawalExceedsBalance
    );

    // Checks-effects-interactions: deduct first
    let ua = &mut ctx.accounts.user_account;
    ua.usdc_balance = ua
        .usdc_balance
        .checked_sub(amount)
        .ok_or_else(|| error!(FuturesError::MathUnderflow))?;

    let vd = &mut ctx.accounts.vault_data;
    vd.total_liquidity = vd.total_liquidity.saturating_sub(amount);

    // SPL transfer: vault → owner, signed by vault_authority PDA
    let vault_authority_bump = ctx.bumps.vault_authority;
    let signer_seeds: &[&[&[u8]]] = &[&[b"vault_authority", &[vault_authority_bump]]];

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
        amount,
    )?;

    msg!("Withdrew {}; remaining balance {}", amount, ua.usdc_balance);
    Ok(())
}
