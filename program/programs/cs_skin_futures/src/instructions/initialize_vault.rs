use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::state::Vault;

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + Vault::INIT_SPACE,
        seeds = [b"vault"],
        bump,
    )]
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

    /// CHECK: PDA verified by seeds + bump; signs vault→user transfers.
    #[account(seeds = [b"vault_authority"], bump)]
    pub vault_authority: UncheckedAccount<'info>,

    pub usdc_mint:      Account<'info, Mint>,
    pub token_program:  Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializeVault>) -> Result<()> {
    let vd = &mut ctx.accounts.vault_data;
    vd.total_liquidity = 0;
    vd.bump = ctx.bumps.vault_data;
    msg!("Vault initialized by {}", ctx.accounts.authority.key());
    Ok(())
}
