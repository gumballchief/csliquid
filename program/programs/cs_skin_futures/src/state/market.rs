use anchor_lang::prelude::*;

/// On-chain state for a single CS skin perpetuals market.
///
/// PDA seeds: `[b"market", price_feed]`
#[account]
#[derive(InitSpace)]
pub struct Market {
    /// Protocol authority that can update oracle prices.
    pub authority: Pubkey,

    /// Human-readable CS skin name (e.g. "AK-47 | Redline (Field-Tested)").
    #[max_len(64)]
    pub skin_id: String,

    /// Off-chain price oracle pubkey; also used as the PDA seed.
    pub price_feed: Pubkey,

    /// Total notional of open long positions (6 decimals, USDC).
    pub total_long_open_interest: u64,

    /// Total notional of open short positions (6 decimals, USDC).
    pub total_short_open_interest: u64,

    /// Current hourly funding rate (8 decimal places, signed).
    /// Positive → longs pay shorts. Negative → shorts pay longs.
    /// Updated each hour by `update_funding_rate`.
    pub funding_rate: i64,

    /// Global funding accumulator (8 decimal places, signed i128).
    /// Incremented by `funding_rate` every hour.
    /// Positions snapshot this at open; `funding_owed` at close =
    ///   (current − entry) × notional / FUNDING_RATE_SCALE.
    pub cumulative_funding: i128,

    /// Unix timestamp of the last `update_funding_rate` call.
    /// Used to enforce the 1-hour crank interval.
    pub last_funding_rate_update: i64,

    /// Unix timestamp of the last `apply_funding` keeper call (8-hour crank).
    pub last_funding_time: i64,

    /// PDA canonical bump.
    pub bump: u8,
}

impl Market {
    /// Legacy keeper funding interval (8 hours).
    pub const FUNDING_INTERVAL: i64 = 8 * 3600;
    /// Permissionless OI-based funding crank interval (1 hour).
    pub const FUNDING_RATE_INTERVAL: i64 = 3600;
}
