/**
 * Perpetual futures math — pure functions, no React, no side effects.
 *
 * Liquidation model (industry standard):
 *   A position is liquidated when its remaining equity falls to the
 *   maintenance margin level.
 *
 *   equity = initialMargin + unrealizedPnl
 *   maintenanceMargin = notional * MAINTENANCE_MARGIN_RATE
 *
 *   Long  liqPrice = entryPrice - (initialMargin - maintenanceMargin) / size
 *                  = entryPrice * (1 - (1/leverage - MMR))
 *   Short liqPrice = entryPrice + (initialMargin - maintenanceMargin) / size
 *                  = entryPrice * (1 + (1/leverage - MMR))
 */

export const MAINTENANCE_MARGIN_RATE = 0.05;   // 5 % of notional
export const TAKER_FEE_RATE          = 0.0005; // 0.05 % of notional
export const MAX_LEVERAGE            = 20;
export const MIN_LEVERAGE            = 1;
export const FUNDING_INTERVAL_HOURS  = 8;      // standard 8-hour funding interval

// ── Price formulas ─────────────────────────────────────────────────────────

/**
 * Returns the price at which the position will be auto-liquidated.
 * The `buffer` is the fraction of notional between initial margin and
 * maintenance margin — the maximum adverse move the position can absorb.
 */
export function calcLiquidationPrice(
  side: 'long' | 'short',
  entryPrice: number,
  leverage: number,
): number {
  const buffer = 1 / leverage - MAINTENANCE_MARGIN_RATE;
  return side === 'long'
    ? entryPrice * (1 - buffer)
    : entryPrice * (1 + buffer);
}

// ── PnL ───────────────────────────────────────────────────────────────────

/**
 * Unrealized PnL and return-on-margin (pct) for an open position.
 * `pct` is relative to `initialMargin` so it reflects leveraged returns.
 */
export function calcUnrealizedPnl(
  side: 'long' | 'short',
  size: number,
  entryPrice: number,
  markPrice: number,
  initialMargin: number,
): { pnl: number; pct: number } {
  const priceDelta = markPrice - entryPrice;
  const pnl = side === 'long' ? priceDelta * size : -priceDelta * size;
  const pct = initialMargin > 0 ? (pnl / initialMargin) * 100 : 0;
  return { pnl, pct };
}

// ── Funding ────────────────────────────────────────────────────────────────

/**
 * Dollar amount a position owes (positive) or receives (negative) for one
 * funding interval.
 *
 * Convention: positive fundingRate → longs pay shorts.
 *   Long payment  = +raw   (outflow from long)
 *   Short payment = -raw   (inflow to short)
 */
export function calcFundingPayment(
  side: 'long' | 'short',
  size: number,
  markPrice: number,
  fundingRate: number,
): number {
  const raw = size * markPrice * fundingRate;
  return side === 'long' ? raw : -raw;
}

// ── Liquidation check ─────────────────────────────────────────────────────

/**
 * Returns true when the position equity has fallen to or below
 * maintenance margin at `markPrice`.
 */
export function isLiquidatable(
  side: 'long' | 'short',
  size: number,
  entryPrice: number,
  markPrice: number,
  currentMargin: number,
): boolean {
  const notional    = entryPrice * size;
  const maintenance = notional * MAINTENANCE_MARGIN_RATE;
  const { pnl }     = calcUnrealizedPnl(side, size, entryPrice, markPrice, currentMargin);
  return currentMargin + pnl <= maintenance;
}

// ── Trade sizing helpers ───────────────────────────────────────────────────

export function calcNotional(collateral: number, leverage: number): number {
  return collateral * leverage;
}

export function calcSize(collateral: number, leverage: number, entryPrice: number): number {
  return calcNotional(collateral, leverage) / entryPrice;
}

export function calcTakerFee(notional: number): number {
  return notional * TAKER_FEE_RATE;
}

export function calcMaintenanceMargin(notional: number): number {
  return notional * MAINTENANCE_MARGIN_RATE;
}
