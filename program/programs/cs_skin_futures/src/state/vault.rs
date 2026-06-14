use anchor_lang::prelude::*;

/// Protocol liquidity tracker.
///
/// Mirrors the SPL token vault balance so instructions can read total
/// protocol liquidity without fetching the token account.
///
/// PDA seeds: `[b"vault"]`
#[account]
#[derive(InitSpace)]
pub struct Vault {
    /// Total USDC deposited across all users (6 decimals).
    pub total_liquidity: u64,

    /// PDA canonical bump.
    pub bump: u8,
}
