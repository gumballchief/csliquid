use anchor_lang::prelude::*;

/// On-chain state for a single open perpetual position.
///
/// Created by `open_position`, closed by `close_position` or `liquidate`.
/// One position per (owner, market) pair — no nonce.
///
/// PDA seeds: `[b"position", owner, market]`
#[account]
#[derive(InitSpace)]
pub struct Position {
    /// Wallet that opened the position.
    pub owner: Pubkey,

    /// The `Market` account this position belongs to.
    pub market: Pubkey,

    /// `true` = long, `false` = short.
    pub is_long: bool,

    /// USDC collateral posted as margin (6 decimals).
    pub collateral: u64,

    /// Position size in base units (6 decimal places).
    pub size: u64,

    /// Notional value at open (collateral × leverage). Stored for exact OI accounting.
    pub notional: u64,

    /// Average entry price (6 decimal places, USDC).
    pub entry_price: u64,

    /// Price at which the position is auto-liquidated (6 decimals, USDC).
    pub liquidation_price: u64,

    /// Unix timestamp when the position was opened.
    pub opened_at: i64,

    /// Snapshot of `market.cumulative_funding` at position open.
    /// Used at close to compute accrued funding:
    ///   funding_owed = (market.cumulative_funding − entry_funding_index)
    ///                  × notional / FUNDING_RATE_SCALE
    /// Positive owed = position pays; negative = position receives.
    pub entry_funding_index: i128,

    /// PDA canonical bump.
    pub bump: u8,
}
