use anchor_lang::prelude::*;

/// Trusted on-chain price feed written exclusively by the protocol admin.
///
/// PDA seeds: `[b"price_feed", skin_id.as_bytes()]`
///
/// The off-chain pusher (`/scripts/push-prices.ts`) fetches prices from the
/// oracle service and calls `push_price` every ~60 seconds.  On-chain
/// instructions call `oracle::get_price`, which rejects prices older than
/// `MAX_PRICE_AGE` (120 s) with `FuturesError::StalePriceFeed`.
#[account]
#[derive(InitSpace)]
pub struct PriceFeed {
    /// Keypair authorised to call `push_price` for this feed.
    pub authority: Pubkey,

    /// Latest pushed price in 6-decimal USDC representation.
    /// $1.00 → 1_000_000.  Zero until the first push.
    pub price: u64,

    /// Unix timestamp (seconds) of the last successful `push_price` call.
    /// Set by the on-chain clock — not supplied by the caller.
    pub published_at: i64,

    /// PDA canonical bump.
    pub bump: u8,
}
