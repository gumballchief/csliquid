use anchor_lang::prelude::*;

/// Per-user protocol account.
///
/// Tracks the USDC balance deposited and all open position PDAs.
///
/// PDA seeds: `[b"user_account", owner]`
#[account]
#[derive(InitSpace)]
pub struct UserAccount {
    /// Wallet that owns this account.
    pub owner: Pubkey,

    /// USDC available for new positions and withdrawals (6 decimals).
    pub usdc_balance: u64,

    /// Pubkeys of all open `Position` PDAs owned by this wallet.
    /// Maximum 20 concurrent positions.
    #[max_len(20)]
    pub positions: Vec<Pubkey>,

    /// PDA canonical bump.
    pub bump: u8,
}
