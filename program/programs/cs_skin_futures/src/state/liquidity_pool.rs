use anchor_lang::prelude::*;

/// Global liquidity pool — the protocol's counterparty for all trades.
///
/// LPs deposit USDC and receive internal LP tokens.  The pool earns trading
/// fees and absorbs the counterparty risk on every perpetual position.
///
/// PDA seeds: `[b"liquidity_pool"]`
#[account]
#[derive(InitSpace)]
pub struct LiquidityPool {
    /// Admin who initialized the pool.
    pub authority: Pubkey,      // 32

    /// Current USDC owned by the pool (6 decimals).
    /// Increases when LPs deposit or traders lose/pay fees.
    /// Decreases when LPs withdraw or traders profit.
    pub total_usdc: u64,        // 8

    /// Total outstanding LP tokens (internal accounting units).
    /// First deposit sets ratio to 1:1 (USDC → LP token).
    pub lp_supply: u64,         // 8

    /// Cumulative trading fees credited to the pool (6 decimals).
    /// Informational — used for APY display.
    pub fees_earned: u64,       // 8

    /// Net PnL paid by the pool to traders (6 decimals, signed).
    /// Positive = pool has paid out profits; negative = pool has profited.
    pub trader_pnl_paid: i64,   // 8

    /// Unix timestamp of pool initialization — used to annualize APY.
    pub inception_ts: i64,      // 8

    /// PDA canonical bump.
    pub bump: u8,               // 1
}
// Discriminator (8) + fields (32+8+8+8+8+8+1) = 81 bytes
