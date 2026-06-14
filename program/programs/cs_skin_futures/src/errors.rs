use anchor_lang::prelude::*;

#[error_code]
pub enum FuturesError {
    // ── Market ────────────────────────────────────────────────────────────────
    #[msg("Market is currently paused")]
    MarketInactive,

    #[msg("Unauthorized: signer is not the market authority")]
    Unauthorized,

    #[msg("Price must be greater than zero")]
    InvalidPrice,

    // ── Account / balance ─────────────────────────────────────────────────────
    #[msg("Insufficient USDC balance")]
    InsufficientBalance,

    #[msg("Withdrawal amount exceeds available balance")]
    WithdrawalExceedsBalance,

    // ── Position parameters ───────────────────────────────────────────────────
    #[msg("Collateral amount must be greater than zero")]
    InvalidCollateral,

    #[msg("Leverage must be between 1× and 20×")]
    InvalidLeverage,

    #[msg("Entry price exceeds slippage tolerance (max_entry_price)")]
    PriceSlippage,

    #[msg("Nonce does not match user_account.position_count — re-fetch and retry")]
    NonceMismatch,

    // ── Liquidation ───────────────────────────────────────────────────────────
    #[msg("Position is healthy and cannot be liquidated")]
    PositionNotLiquidatable,

    #[msg("Position owner does not match the provided user_account")]
    PositionOwnerMismatch,

    // ── Funding ───────────────────────────────────────────────────────────────
    #[msg("Funding interval has not elapsed yet")]
    FundingNotDue,

    #[msg("Funding rate update interval (1 hour) has not elapsed yet")]
    FundingTooEarly,

    // ── Oracle ────────────────────────────────────────────────────────────────
    #[msg("Price feed data is older than 2 minutes — push a fresh price")]
    StalePriceFeed,

    // ── Arithmetic ────────────────────────────────────────────────────────────
    #[msg("Arithmetic overflow")]
    MathOverflow,

    #[msg("Arithmetic underflow")]
    MathUnderflow,

    // ── Liquidity pool ────────────────────────────────────────────────────────
    #[msg("LP withdrawal cooldown (24 h) has not elapsed — wait before removing liquidity")]
    LpCooldownActive,

    #[msg("Pool has insufficient liquidity to cover this withdrawal")]
    InsufficientPoolLiquidity,

    #[msg("Insufficient LP tokens — cannot withdraw more than you own")]
    InsufficientLpTokens,
}
