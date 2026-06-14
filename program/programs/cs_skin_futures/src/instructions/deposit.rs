use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount, Transfer},
};

use crate::state::{UserAccount, Vault};

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    /// Created on first deposit via `init_if_needed`.
    /// Seeds: [b"user_account", owner]
    #[account(
        init_if_needed,
        payer  = owner,
        space  = 8 + UserAccount::INIT_SPACE,
        seeds  = [b"user_account", owner.key().as_ref()],
        bump,
    )]
    pub user_account: Box<Account<'info, UserAccount>>,

    /// Depositor's USDC associated token account.
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

    pub usdc_mint:                Box<Account<'info, Mint>>,
    pub token_program:            Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program:           Program<'info, System>,
}

pub fn handler(ctx: Context<Deposit>, amount: u64) -> Result<()> {
    require!(amount > 0, crate::errors::FuturesError::InvalidCollateral);

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

    let ua = &mut ctx.accounts.user_account;
    if ua.owner == Pubkey::default() {
        ua.owner        = ctx.accounts.owner.key();
        ua.usdc_balance = 0;
        ua.bump         = ctx.bumps.user_account;
    }
    ua.usdc_balance = ua
        .usdc_balance
        .checked_add(amount)
        .ok_or_else(|| error!(crate::errors::FuturesError::MathOverflow))?;

    ctx.accounts.vault_data.total_liquidity = ctx.accounts.vault_data.total_liquidity
        .checked_add(amount)
        .ok_or_else(|| error!(crate::errors::FuturesError::MathOverflow))?;

    msg!("Deposited {}; balance={}, total_liquidity={}", amount, ua.usdc_balance, ctx.accounts.vault_data.total_liquidity);
    Ok(())
}
