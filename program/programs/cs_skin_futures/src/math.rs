/// On-chain perpetual futures math — pure functions, integer-only.
///
/// ## Precision model
///
/// | Value     | Unit        | Example                        |
/// |-----------|-------------|--------------------------------|
/// | Price     | USDC × 10⁶  | $42.50  → 42_500_000           |
/// | Notional  | USDC × 10⁶  | $100    → 100_000_000          |
/// | Size      | skin × 10⁶  | 2.352 skins → 2_352_941        |
/// | Rate      | × 10⁸       | 0.01% per 8h → 10_000          |
///
/// All intermediate multiplications use u128 to prevent overflow.
use crate::errors::FuturesError;
use anchor_lang::prelude::*;

// ── Constants ─────────────────────────────────────────────────────────────────

/// Denominator for basis-point arithmetic (1 bps = 1 / BPS_DENOM).
pub const BPS_DENOM: u64 = 10_000;

/// Maintenance margin rate: 5% = 500 bps.
/// A position is liquidatable when equity ≤ notional × MMR.
pub const MAINTENANCE_MARGIN_BPS: u64 = 500;

/// Taker fee rate: 0.05% = 5 bps.
pub const TAKER_FEE_BPS: u64 = 5;

/// Scale factor applied to size so fractions survive integer division.
/// size = notional * SIZE_SCALE / entry_price
pub const SIZE_SCALE: u64 = 1_000_000;

/// Scale factor for funding-rate arithmetic (rate uses 8 decimal places).
pub const FUNDING_RATE_SCALE: i64 = 100_000_000;

// ── Sizing helpers ─────────────────────────────────────────────────────────────

/// Position size in base units: `notional * SIZE_SCALE / entry_price`.
pub fn calc_size(notional: u64, entry_price: u64) -> Result<u64> {
    require!(entry_price > 0, FuturesError::InvalidPrice);
    (notional as u128)
        .checked_mul(SIZE_SCALE as u128)
        .ok_or_else(|| error!(FuturesError::MathOverflow))?
        .checked_div(entry_price as u128)
        .ok_or_else(|| error!(FuturesError::MathOverflow))
        .map(|v| v as u64)
}

/// Notional value: `size * price / SIZE_SCALE`.
pub fn calc_notional(size: u64, price: u64) -> Result<u64> {
    (size as u128)
        .checked_mul(price as u128)
        .ok_or_else(|| error!(FuturesError::MathOverflow))?
        .checked_div(SIZE_SCALE as u128)
        .ok_or_else(|| error!(FuturesError::MathOverflow))
        .map(|v| v as u64)
}

/// Taker fee: `notional * TAKER_FEE_BPS / BPS_DENOM`.
pub fn calc_taker_fee(notional: u64) -> Result<u64> {
    (notional as u128)
        .checked_mul(TAKER_FEE_BPS as u128)
        .ok_or_else(|| error!(FuturesError::MathOverflow))?
        .checked_div(BPS_DENOM as u128)
        .ok_or_else(|| error!(FuturesError::MathOverflow))
        .map(|v| v as u64)
}

/// Maintenance margin: `notional * MAINTENANCE_MARGIN_BPS / BPS_DENOM`.
pub fn calc_maintenance_margin(notional: u64) -> Result<u64> {
    (notional as u128)
        .checked_mul(MAINTENANCE_MARGIN_BPS as u128)
        .ok_or_else(|| error!(FuturesError::MathOverflow))?
        .checked_div(BPS_DENOM as u128)
        .ok_or_else(|| error!(FuturesError::MathOverflow))
        .map(|v| v as u64)
}

// ── Liquidation price ──────────────────────────────────────────────────────────

/// Derives the price at which the position will be auto-liquidated.
///
/// Derivation (long):
///   equity = margin + (mark − entry) × size = maintenance_margin
///   mark   = entry − (margin − mm) / size
///          = entry × (1 − 1/leverage + MMR)
///          = entry × (lev × BPS − BPS + MMR × lev) / (lev × BPS)
///
/// Short mirrors with flipped signs.
pub fn calc_liquidation_price(
    side_is_long: bool,
    entry_price: u64,
    leverage: u8,
) -> Result<u64> {
    let lev = leverage as u128;
    let bps = BPS_DENOM as u128;
    let mmr = MAINTENANCE_MARGIN_BPS as u128;

    let numerator = if side_is_long {
        // (lev × BPS) − BPS + (MMR × lev)
        lev.checked_mul(bps)
            .ok_or_else(|| error!(FuturesError::MathOverflow))?
            .checked_sub(bps)
            .ok_or_else(|| error!(FuturesError::MathUnderflow))?
            .checked_add(mmr.checked_mul(lev).ok_or_else(|| error!(FuturesError::MathOverflow))?)
            .ok_or_else(|| error!(FuturesError::MathOverflow))?
    } else {
        // (lev × BPS) + BPS − (MMR × lev)
        lev.checked_mul(bps)
            .ok_or_else(|| error!(FuturesError::MathOverflow))?
            .checked_add(bps)
            .ok_or_else(|| error!(FuturesError::MathOverflow))?
            .checked_sub(mmr.checked_mul(lev).ok_or_else(|| error!(FuturesError::MathOverflow))?)
            .ok_or_else(|| error!(FuturesError::MathUnderflow))?
    };

    let denominator = lev
        .checked_mul(bps)
        .ok_or_else(|| error!(FuturesError::MathOverflow))?;

    (entry_price as u128)
        .checked_mul(numerator)
        .ok_or_else(|| error!(FuturesError::MathOverflow))?
        .checked_div(denominator)
        .ok_or_else(|| error!(FuturesError::MathOverflow))
        .map(|v| v as u64)
}

// ── Unrealized PnL ─────────────────────────────────────────────────────────────

/// Unrealized PnL in USDC lamports (signed).
///
/// Long PnL  = (mark − entry) × size / SIZE_SCALE
/// Short PnL = (entry − mark) × size / SIZE_SCALE
pub fn calc_unrealized_pnl(
    side_is_long: bool,
    size: u64,
    entry_price: u64,
    mark_price: u64,
) -> Result<i64> {
    let (higher, lower) = if mark_price >= entry_price {
        (mark_price, entry_price)
    } else {
        (entry_price, mark_price)
    };

    let price_delta = higher - lower; // always ≥ 0, no underflow
    let abs_pnl = (price_delta as u128)
        .checked_mul(size as u128)
        .ok_or_else(|| error!(FuturesError::MathOverflow))?
        .checked_div(SIZE_SCALE as u128)
        .ok_or_else(|| error!(FuturesError::MathOverflow))?;

    // Safe cast: abs_pnl < max notional ≈ 2^40, well within i64 range
    let abs_pnl = abs_pnl as i64;

    let pnl = if side_is_long {
        if mark_price >= entry_price { abs_pnl } else { -abs_pnl }
    } else {
        if entry_price >= mark_price { abs_pnl } else { -abs_pnl }
    };

    Ok(pnl)
}

// ── Liquidation check ──────────────────────────────────────────────────────────

/// Returns `true` when the position should be liquidated.
/// Condition: initial_margin + unrealized_pnl ≤ maintenance_margin
pub fn is_liquidatable(
    side_is_long: bool,
    size: u64,
    entry_price: u64,
    mark_price: u64,
    initial_margin: u64,
    maintenance_margin: u64,
) -> Result<bool> {
    let pnl = calc_unrealized_pnl(side_is_long, size, entry_price, mark_price)?;
    let equity = (initial_margin as i64)
        .checked_add(pnl)
        .ok_or_else(|| error!(FuturesError::MathOverflow))?;
    Ok(equity <= maintenance_margin as i64)
}

// ── Cumulative funding settlement ─────────────────────────────────────────────

/// Compute the net funding payment for a position since it was opened.
///
/// `index_delta = market.cumulative_funding − position.entry_funding_index`
///
/// Sign convention (positive = position PAYS, negative = position RECEIVES):
///   Long:  funding_owed =  index_delta × notional / FUNDING_RATE_SCALE
///   Short: funding_owed = −index_delta × notional / FUNDING_RATE_SCALE
///
/// When index_delta > 0 longs paid historically (more longs than shorts), so
/// a long owes the positive amount and a short receives it, and vice-versa.
///
/// The return value is an `i64` that is directly subtracted from net_return on
/// close — negative means the position receives funding back, which increases
/// the payout.
pub fn calc_funding_owed(is_long: bool, index_delta: i128, notional: u64) -> Result<i64> {
    // Use unsigned_abs to stay in u128 for the multiply, then reintroduce sign.
    const SCALE: u128 = 100_000_000; // == FUNDING_RATE_SCALE

    let abs_raw = index_delta
        .unsigned_abs()
        .checked_mul(notional as u128)
        .ok_or_else(|| error!(FuturesError::MathOverflow))?
        .checked_div(SCALE)
        .ok_or_else(|| error!(FuturesError::MathOverflow))?;

    let raw = i64::try_from(abs_raw).map_err(|_| error!(FuturesError::MathOverflow))?;

    // index_delta ≥ 0  → longs pay (+raw), shorts receive (−raw)
    // index_delta < 0  → longs receive (−raw), shorts pay (+raw)
    let signed = if index_delta >= 0 { raw } else { -raw };
    Ok(if is_long { signed } else { -signed })
}

// ── Funding payment ────────────────────────────────────────────────────────────

/// Dollar amount owed (positive = outflow, negative = inflow) for one
/// funding interval.
///
/// payment = size × mark_price / SIZE_SCALE × funding_rate / FUNDING_RATE_SCALE
///
/// Convention: positive rate → longs pay, shorts receive.
pub fn calc_funding_payment(
    side_is_long: bool,
    size: u64,
    mark_price: u64,
    funding_rate: i64,
) -> Result<i64> {
    // notional = size × mark_price / SIZE_SCALE  (USDC lamports)
    let notional = calc_notional(size, mark_price)?;

    // raw = notional × |funding_rate| / FUNDING_RATE_SCALE
    let abs_rate = funding_rate.unsigned_abs();
    let raw = (notional as u128)
        .checked_mul(abs_rate as u128)
        .ok_or_else(|| error!(FuturesError::MathOverflow))?
        .checked_div(FUNDING_RATE_SCALE.unsigned_abs() as u128)
        .ok_or_else(|| error!(FuturesError::MathOverflow))? as i64;

    // Apply direction: positive rate → long pays (+raw), short receives (−raw)
    let signed_raw = if funding_rate >= 0 { raw } else { -raw };

    Ok(if side_is_long { signed_raw } else { -signed_raw })
}
