use anchor_lang::prelude::*;

use crate::{errors::FuturesError, state::PriceFeed};

/// Maximum age (seconds) of a `PriceFeed` price before it is rejected.
/// The pusher script writes every 60 s, so 120 s gives two missed cycles of
/// headroom before positions start reverting with `StalePriceFeed`.
pub const MAX_PRICE_AGE: i64 = 120;

/// Read and validate the current price from a protocol `PriceFeed` account.
///
/// Returns the price in 6-decimal USDC format ($1.00 → 1_000_000).
///
/// Rejects with `StalePriceFeed` if the price is older than `MAX_PRICE_AGE`.
/// Rejects with `InvalidPrice` if price is zero (feed not yet initialised).
pub fn get_price(price_feed: &PriceFeed, clock: &Clock) -> Result<u64> {
    let age = clock.unix_timestamp.saturating_sub(price_feed.published_at);
    require!(age <= MAX_PRICE_AGE, FuturesError::StalePriceFeed);
    require!(price_feed.price > 0, FuturesError::InvalidPrice);
    Ok(price_feed.price)
}
