use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::state::Vault;

/// Adds a vault token account for a new USDC mint without touching vault_data.
/// Called once per mint to support test-mint swaps on devnet.
#[derive(Accounts)]
pub struct InitializeVaultToken<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(seeds = [b"vault"], bump = vault_data.bump)]
    pub vault_data: Account<'info, Vault>,

    #[account(
        init,
        payer            = authority,
        token::mint      = usdc_mint,
        token::authority = vault_authority,
        seeds            = [b"vault", usdc_mint.key().as_ref()],
        bump,
    )]
    pub vault_token: Account<'info, TokenAccount>,

    /// CHECK: PDA signer; no data read.
    #[account(seeds = [b"vault_authority"], bump)]
    pub vault_authority: UncheckedAccount<'info>,

    pub usdc_mint:      Account<'info, Mint>,
    pub token_program:  Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializeVaultToken>) -> Result<()> {
    msg!(
        "VaultToken initialized for mint={} at {}",
        ctx.accounts.usdc_mint.key(),
        ctx.accounts.vault_token.key(),
    );
    Ok(())
}
