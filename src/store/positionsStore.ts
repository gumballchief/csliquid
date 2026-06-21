/**
 * Perpetual futures positions store (Zustand + localStorage persistence).
 *
 * TODO: On-chain settlement via Solana program
 *   - Replace openPosition with a signed Solana transaction (open_position instruction)
 *   - Replace closePosition with a close_position instruction
 *   - Funding/liquidation handled by an on-chain keeper crank
 *   - Store would cache program account state, not own the source of truth
 *   - Fields for future on-chain integration are marked with TODO below
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Skin } from '@/types';
import {
  calcLiquidationPrice,
  calcUnrealizedPnl,
  calcFundingPayment,
  isLiquidatable,
  calcNotional,
  calcSize,
  calcTakerFee,
  calcMaintenanceMargin,
} from '@/lib/perps';

// ── Domain types ──────────────────────────────────────────────────────────

export interface PerpsPosition {
  id:               string;
  skinId:           string;
  skin:             Skin;
  side:             'long' | 'short';
  /** Fractional units of the skin (notional / entryPrice) */
  size:             number;
  /** Gross notional = collateral × leverage (at entry) */
  notional:         number;
  entryPrice:       number;
  markPrice:        number;  // updated by updateMarkPrices()
  liquidationPrice: number;
  leverage:         number;
  /** Initial margin deposited (collateral) */
  margin:           number;
  maintenanceMargin: number;
  unrealizedPnl:    number;  // recalculated by updateMarkPrices()
  unrealizedPnlPct: number;  // % of initial margin (leveraged ROE)
  fundingAccrued:   number;  // cumulative funding payments (outflows positive)
  openedAt:         string;  // ISO 8601
  txSignature?:     string;  // on-chain open tx (set when opened via Anchor program)
  positionPda?:     string;  // Solana program-derived address (encoded as base58)
}

export interface ClosedTrade {
  id:              string;
  positionId:      string;
  skinId:          string;
  skin:            Skin;
  side:            'long' | 'short';
  size:            number;
  notional:        number;
  entryPrice:      number;
  exitPrice:       number;
  realizedPnl:     number;  // net: gross PnL - closing fee - funding accrued
  grossPnl:        number;  // price PnL before fees/funding
  closingFee:      number;
  fundingAccrued:  number;
  leverage:        number;
  openedAt:        number;  // Unix ms
  closedAt:        number;  // Unix ms
  isLiquidation:   boolean;
  // TODO: on-chain fields
  // txSignature?: string;
}

// ── Params ────────────────────────────────────────────────────────────────

export interface OpenPositionParams {
  skinId:          string;
  skin:            Skin;
  side:            'long' | 'short';
  collateral:      number;   // USDC, becomes initial margin
  leverage:        number;
  entryPrice:      number;
  txSignature?:    string;   // on-chain tx sig when opened via Anchor program
  positionPda?:    string;   // base58 position account address
  balanceOverride?: number;  // live on-chain balance; overrides stale store usdcBalance for guard checks
}

export type OpenPositionResult =
  | { success: true;  position: PerpsPosition }
  | { success: false; error: string };

// ── Store ──────────────────────────────────────────────────────────────────

const INITIAL_BALANCE = 5_000; // USDC (devnet paper balance; mainnet will use real on-chain balance)

interface PositionsState {
  positions:    PerpsPosition[];
  tradeHistory: ClosedTrade[];
  usdcBalance:  number;
  /** The wallet address whose data is currently loaded. Empty = no wallet connected. */
  walletKey:    string;
}

interface PositionsActions {
  /** Open a new leveraged position. Deducts margin + taker fee from balance. */
  openPosition: (params: OpenPositionParams) => OpenPositionResult;

  /** Close an open position at `exitPrice`, realizing PnL and returning margin. */
  closePosition: (positionId: string, exitPrice: number) => void;

  /** Close all open positions at the provided mark prices. */
  closeAllPositions: (markPrices: Record<string, number>) => void;

  /**
   * Update mark prices and recalculate unrealized PnL for affected positions.
   * Call this on every price tick (every ~30 s from useSkinPrice).
   */
  updateMarkPrices: (markPrices: Record<string, number>) => void;

  /**
   * Apply one funding interval payment for all positions in a given market.
   * Deducts payment from position margin (longs pay when rate is positive).
   * TODO: replace with on-chain keeper crank call.
   */
  applyFunding: (skinId: string, fundingRate: number, markPrice: number) => void;

  /**
   * Check all positions and liquidate those whose equity has fallen to or
   * below maintenance margin at the given mark prices.
   */
  liquidateUnderwater: (markPrices: Record<string, number>) => void;

  /** Refund balance to initial value and wipe all positions (dev helper). */
  resetAccount: () => void;

  /**
   * Load state for a specific wallet address from per-wallet localStorage.
   * Saves the current wallet's state first, then loads the new one.
   * Pass null / empty string when wallet disconnects (saves but doesn't load new).
   */
  loadWallet: (address: string | null) => void;
}

export const usePositionsStore = create<PositionsState & PositionsActions>()(
  persist(
    (set, get) => ({
      // ── Initial state ─────────────────────────────────────────────────
      positions:    [],
      tradeHistory: [],
      usdcBalance:  INITIAL_BALANCE,
      walletKey:    '',

      // ── Open ──────────────────────────────────────────────────────────
      openPosition: (params) => {
        const { skinId, skin, side, collateral, leverage, entryPrice } = params;
        const { usdcBalance } = get();
        // Use live on-chain balance when provided (avoids stale store value for wallet users)
        const guardBalance = typeof params.balanceOverride === 'number' ? params.balanceOverride : usdcBalance;

        if (collateral <= 0)               return { success: false, error: 'Collateral must be greater than zero' };
        if (collateral > guardBalance)     return { success: false, error: 'Insufficient USDC balance' };
        if (leverage < 1 || leverage > 20) return { success: false, error: `Leverage must be between 1× and 20×` };
        if (entryPrice <= 0)               return { success: false, error: 'Invalid entry price' };

        const notional          = calcNotional(collateral, leverage);
        const size              = calcSize(collateral, leverage, entryPrice);
        const takerFee          = calcTakerFee(notional);
        const totalCost         = collateral + takerFee;
        const maintenanceMargn  = calcMaintenanceMargin(notional);
        const liquidationPrice  = calcLiquidationPrice(side, entryPrice, leverage);

        if (totalCost > guardBalance) {
          return { success: false, error: 'Insufficient balance to cover margin and fee' };
        }

        const position: PerpsPosition = {
          id:               crypto.randomUUID(),
          skinId,
          skin,
          side,
          size,
          notional,
          entryPrice,
          markPrice:        entryPrice,
          liquidationPrice,
          leverage,
          margin:           collateral,
          maintenanceMargin: maintenanceMargn,
          unrealizedPnl:    0,
          unrealizedPnlPct: 0,
          fundingAccrued:   0,
          openedAt:         new Date().toISOString(),
          txSignature:      params.txSignature,
          positionPda:      params.positionPda,
        };

        set(state => ({
          positions:   [...state.positions, position],
          usdcBalance: state.usdcBalance - totalCost,
        }));

        return { success: true, position };
      },

      // ── Close ─────────────────────────────────────────────────────────
      closePosition: (positionId, exitPrice) => {
        const pos = get().positions.find(p => p.id === positionId);
        if (!pos) return;

        const { pnl: grossPnl } = calcUnrealizedPnl(
          pos.side, pos.size, pos.entryPrice, exitPrice, pos.margin,
        );
        const closingFee   = calcTakerFee(pos.notional);
        const realizedPnl  = grossPnl - closingFee - pos.fundingAccrued;
        const returnedCap  = Math.max(0, pos.margin + realizedPnl);

        const trade: ClosedTrade = {
          id:            crypto.randomUUID(),
          positionId:    pos.id,
          skinId:        pos.skinId,
          skin:          pos.skin,
          side:          pos.side,
          size:          pos.size,
          notional:      pos.notional,
          entryPrice:    pos.entryPrice,
          exitPrice,
          realizedPnl,
          grossPnl,
          closingFee,
          fundingAccrued: pos.fundingAccrued,
          leverage:      pos.leverage,
          openedAt:      new Date(pos.openedAt).getTime(),
          closedAt:      Date.now(),
          isLiquidation: false,
        };

        set(state => ({
          positions:    state.positions.filter(p => p.id !== positionId),
          tradeHistory: [trade, ...state.tradeHistory],
          usdcBalance:  state.usdcBalance + returnedCap,
        }));
      },

      // ── Close all ─────────────────────────────────────────────────────
      closeAllPositions: (markPrices) => {
        // Snapshot IDs so mutations inside closePosition don't cause skips
        const ids = get().positions.map(p => p.id);
        const prices = markPrices;
        ids.forEach(id => {
          const pos = get().positions.find(p => p.id === id);
          if (pos) get().closePosition(id, prices[pos.skinId] ?? pos.markPrice);
        });
      },

      // ── Mark price sync ───────────────────────────────────────────────
      updateMarkPrices: (markPrices) => {
        set(state => ({
          positions: state.positions.map(pos => {
            const mp = markPrices[pos.skinId];
            if (mp === undefined || mp === pos.markPrice) return pos;
            const { pnl, pct } = calcUnrealizedPnl(
              pos.side, pos.size, pos.entryPrice, mp, pos.margin,
            );
            return { ...pos, markPrice: mp, unrealizedPnl: pnl, unrealizedPnlPct: pct };
          }),
        }));
      },

      // ── Funding ───────────────────────────────────────────────────────
      applyFunding: (skinId, fundingRate, markPrice) => {
        set(state => ({
          positions: state.positions.map(pos => {
            if (pos.skinId !== skinId) return pos;
            const payment        = calcFundingPayment(pos.side, pos.size, markPrice, fundingRate);
            const newMargin      = pos.margin - payment;
            const newFunding     = pos.fundingAccrued + payment;
            // Recompute liq price since effective margin changed
            const newLiqPrice    = pos.side === 'long'
              ? pos.entryPrice - (newMargin - pos.maintenanceMargin) / pos.size
              : pos.entryPrice + (newMargin - pos.maintenanceMargin) / pos.size;
            return {
              ...pos,
              margin:           Math.max(0, newMargin),
              fundingAccrued:   newFunding,
              liquidationPrice: newLiqPrice,
            };
          }),
        }));
      },

      // ── Liquidation ───────────────────────────────────────────────────
      liquidateUnderwater: (markPrices) => {
        const toRemove: string[] = [];
        const newTrades: ClosedTrade[] = [];
        const now = Date.now();
        const GRACE_MS = 15_000; // never liquidate a position opened < 15 s ago

        get().positions.forEach(pos => {
          // Grace period: stale cached prices can trigger instant liquidation
          // before the oracle syncs after a position is opened.
          if (now - new Date(pos.openedAt).getTime() < GRACE_MS) return;

          const mp = markPrices[pos.skinId] ?? pos.markPrice;
          if (!isLiquidatable(pos.side, pos.size, pos.entryPrice, mp, pos.margin)) return;

          toRemove.push(pos.id);
          newTrades.push({
            id:             crypto.randomUUID(),
            positionId:     pos.id,
            skinId:         pos.skinId,
            skin:           pos.skin,
            side:           pos.side,
            size:           pos.size,
            notional:       pos.notional,
            entryPrice:     pos.entryPrice,
            exitPrice:      pos.liquidationPrice,
            realizedPnl:    -(pos.margin),  // entire margin is lost on liquidation
            grossPnl:       -(pos.margin),
            closingFee:     0,
            fundingAccrued: pos.fundingAccrued,
            leverage:       pos.leverage,
            openedAt:       new Date(pos.openedAt).getTime(),
            closedAt:       Date.now(),
            isLiquidation:  true,
          });
        });

        if (toRemove.length === 0) return;

        set(state => ({
          positions:    state.positions.filter(p => !toRemove.includes(p.id)),
          tradeHistory: [...newTrades, ...state.tradeHistory],
          // No balance returned on liquidation
        }));
      },

      // ── Dev reset ─────────────────────────────────────────────────────
      resetAccount: () => set({
        positions:    [],
        tradeHistory: [],
        usdcBalance:  INITIAL_BALANCE,
      }),

      // ── Per-wallet persistence ─────────────────────────────────────────
      loadWallet: (address) => {
        const { walletKey, positions, tradeHistory, usdcBalance } = get();

        // Already showing the right wallet — nothing to do
        if (address && address === walletKey) return;

        // Save current wallet's state before switching
        if (walletKey) {
          const snapshot = JSON.stringify({ positions, tradeHistory, usdcBalance });
          try { localStorage.setItem(`cs-futures-wallet-${walletKey}`, snapshot); } catch {}
        }

        if (!address) {
          set({ walletKey: '', positions: [], tradeHistory: [], usdcBalance: 0 });
          return;
        }

        // Check for a saved per-wallet snapshot
        let loaded: { positions: PerpsPosition[]; tradeHistory: ClosedTrade[]; usdcBalance: number } | null = null;
        try {
          const raw = localStorage.getItem(`cs-futures-wallet-${address}`);
          if (raw) loaded = JSON.parse(raw);
        } catch {}

        // Migration: if walletKey was '' (store predates per-wallet support) AND
        // the current in-memory state has real data, adopt it for this wallet
        // instead of wiping it with a fresh account.
        if (!loaded && !walletKey && (positions.length > 0 || usdcBalance !== INITIAL_BALANCE)) {
          loaded = { positions, tradeHistory, usdcBalance };
        }

        set({
          walletKey:    address,
          positions:    loaded?.positions    ?? [],
          tradeHistory: loaded?.tradeHistory ?? [],
          usdcBalance:  loaded?.usdcBalance  ?? INITIAL_BALANCE,
        });
      },
    }),

    {
      name:    'cs-futures-positions-v1',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        positions:    state.positions,
        tradeHistory: state.tradeHistory,
        usdcBalance:  state.usdcBalance,
        walletKey:    state.walletKey,
      }),
    },
  ),
);

// Auto-save active wallet's state to per-wallet key on every relevant change.
// This runs in the browser only (localStorage is undefined in Node/SSR).
if (typeof window !== 'undefined') {
  usePositionsStore.subscribe((state) => {
    if (!state.walletKey) return;
    try {
      localStorage.setItem(
        `cs-futures-wallet-${state.walletKey}`,
        JSON.stringify({
          positions:    state.positions,
          tradeHistory: state.tradeHistory,
          usdcBalance:  state.usdcBalance,
        }),
      );
    } catch {}
  });
}

// ── Derived selectors (call outside React for one-off reads) ──────────────

export function selectTotalUnrealizedPnl(state: PositionsState): number {
  return state.positions.reduce((sum, p) => sum + p.unrealizedPnl, 0);
}

export function selectTotalMarginUsed(state: PositionsState): number {
  return state.positions.reduce((sum, p) => sum + p.margin, 0);
}

export function selectAvailableBalance(state: PositionsState): number {
  return state.usdcBalance;
}
