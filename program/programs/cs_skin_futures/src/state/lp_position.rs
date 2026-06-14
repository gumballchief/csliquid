use anchor_lang::prelude::*;

/// Per-user LP position tracking token balance and cooldown.
///
/// LP tokens represent a proportional share of `LiquidityPool.total_usdc`.
/// A 24-hour cooldown after the last deposit prevents LP front-running.
///
/// PDA seeds: `[b"lp_position", owner]`
#[account]
#[derive(InitSpace)]
pub struct LpPosition {
    pub owner: Pubkey,       // 32
    pub lp_tokens: u64,      // 8 — LP token balance
    pub deposited_at: i64,   // 8 — Unix ts of last add_liquidity (cooldown start)
    pub bump: u8,            // 1
}
// Discriminator (8) + fields (32+8+8+1) = 57 bytes
