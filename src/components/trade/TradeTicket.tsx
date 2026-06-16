'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import type { Program } from '@coral-xyz/anchor';
import { BN } from '@coral-xyz/anchor';
import { decodeBase58 } from '@/lib/base58';
import { useAuth } from '@/contexts/AuthContext';
import ReviewModal from './ReviewModal';
import SwapModal   from '@/components/wallet/SwapModal';
import { usePositionsStore } from '@/store/positionsStore';
import { useToastStore } from '@/store/toastStore';
import { useProgram } from '@/hooks/useProgram';
import {
  sendOpenPosition, sendOpenPositionKeypair,
  sendClosePosition, sendClosePositionKeypair,
  extractErrorMessage, findMarketPda, findPositionPda,
  sendDeposit, sendWithdraw, sendDepositKeypair, sendWithdrawKeypair,
  fetchUserAccountBalance,
} from '@/lib/program';
import { USDC_MINT, PROGRAM_ID } from '@/lib/config';
import { isMarketConfigured, getPriceFeed, findPriceFeedPda } from '@/lib/markets';
import { calcLiquidationPrice, calcNotional, calcTakerFee } from '@/lib/perps';
import { useMarketPrice } from '@/hooks/useMarketPrice';
import { Skin } from '@/types';

// Anchor Position account discriminator — sha256("account:Position")[0..8]
const POSITION_DISC = [170, 188, 143, 228, 122, 64, 247, 208];

// Reads the referrer cookie set by /ref/[username] and pings /api/referral/track.
// Fire-and-forget — never blocks trade UI.
function fireReferralTrack(tradeVolume: number, fee: number): void {
  try {
    const match = document.cookie.split('; ').find(r => r.startsWith('referrer='));
    if (!match) return;
    const referrerWallet = decodeURIComponent(match.split('=')[1] ?? '');
    if (!referrerWallet) return;
    console.log('[referral] tracking trade for referrer:', referrerWallet, 'volume:', tradeVolume, 'fee:', fee);
    fetch('/api/referral/track', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ referrerWallet, tradeVolume, fee }),
    })
      .then(r => r.json())
      .then(d => console.log('[referral] track result:', d))
      .catch(e => console.error('[referral] track error:', e));
  } catch {}
}

interface ExistingPosition {
  side:             'long' | 'short';
  collateral:       number;
  size:             number;
  entryPrice:       number;
  liquidationPrice: number;
}

interface Props {
  skinId:    string;
  skin:      Skin;
  skinName:  string;
  markPrice: number;
}

type OrderType = 'market' | 'limit' | 'stop';

const QUICK_LEVERAGES = [1, 2, 5, 10, 20] as const;
const LEV_MARKS       = [1, 2, 5, 10, 20] as const;

function fmtPrice(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const inputCls = 'w-full bg-tx-bg border border-tx-border2 rounded-sm pl-5 pr-3 py-2 text-[12px] text-tx-text placeholder-tx-dim font-mono tabular-nums focus:outline-none focus:border-tx-muted transition-colors';
const labelCls = 'text-[10px] font-mono uppercase tracking-[0.08em] text-tx-dim';

export default function TradeTicket({ skinId, skin, skinName, markPrice: staticPrice }: Props) {
  const { markPrice: livePrice } = useMarketPrice(skinId);
  const markPrice = livePrice > 0 ? livePrice : staticPrice;
  const { connected, publicKey } = useWallet();
  const { connection }           = useConnection();
  const { user }                 = useAuth();
  const program                  = useProgram();
  const addToast                 = useToastStore((s) => s.addToast);

  const usdcBalance  = usePositionsStore((s) => s.usdcBalance);
  const openPosition = usePositionsStore((s) => s.openPosition);

  const [side,         setSide]         = useState<'long' | 'short'>('long');
  const [orderType,    setOrderType]    = useState<OrderType>('market');
  const [leverage,     setLeverage]     = useState(5);
  const [collateral,   setCollateral]   = useState('');
  const [limitPrice,   setLimitPrice]   = useState('');
  const [stopLoss,     setStopLoss]     = useState('');
  const [takeProfit,   setTakeProfit]   = useState('');
  const [solBalance,        setSolBalance]        = useState<number | null>(null);
  const [walletUsdcBalance, setWalletUsdcBalance] = useState<number | null>(null);
  const [vaultBalance,      setVaultBalance]      = useState<number | null>(null);
  const [showReview,        setShowReview]        = useState(false);
  const [showDeposit,  setShowDeposit]  = useState(false);
  const [showSwap,     setShowSwap]     = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback,     setFeedback]     = useState<{ ok: boolean; msg: string } | null>(null);
  const [longOI,  setLongOI]  = useState<number>(0);
  const [shortOI, setShortOI] = useState<number>(0);

  // Existing on-chain position for this wallet + market (null = none)
  const [existingPos,    setExistingPos]    = useState<ExistingPosition | null>(null);
  const [closeConfirm,   setCloseConfirm]   = useState(false);
  const [closingExisting, setClosingExisting] = useState(false);

  const sessionAddress = connected && publicKey
    ? publicKey.toBase58()
    : user?.type === 'generated' ? user.address : null;

  // Public key for the active signer — covers Phantom and generated wallets
  const generatedPubkey = useMemo(
    () => user?.type === 'generated' ? new PublicKey(user.address) : null,
    [user],
  );
  const signerPubkey = (connected && publicKey) ? publicKey : generatedPubkey;

  // SOL balance for display
  useEffect(() => {
    if (!sessionAddress) { setSolBalance(0); return; }
    let cancelled = false;
    connection.getBalance(new PublicKey(sessionAddress))
      .then(lam => { if (!cancelled) setSolBalance(lam / LAMPORTS_PER_SOL); })
      .catch(() => { if (!cancelled) setSolBalance(0); });
    return () => { cancelled = true; };
  }, [sessionAddress, connection]);

  // Wallet USDC ATA balance (for WALLET display in balance bar)
  useEffect(() => {
    if (!signerPubkey) { setWalletUsdcBalance(null); return; }
    let cancelled = false;
    connection.getParsedTokenAccountsByOwner(signerPubkey, { mint: USDC_MINT })
      .then(res => {
        if (cancelled) return;
        const accts = res.value;
        setWalletUsdcBalance(accts.length > 0
          ? ((accts[0].account.data.parsed.info.tokenAmount.uiAmount as number) ?? 0)
          : 0);
      })
      .catch(() => { if (!cancelled) setWalletUsdcBalance(0); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, publicKey, generatedPubkey, connection]);

  // Vault balance — fetch for both Phantom and generated wallet users
  useEffect(() => {
    if (!signerPubkey) { setVaultBalance(null); return; }
    let cancelled = false;
    fetchUserAccountBalance(connection, signerPubkey)
      .then(b => { if (!cancelled) setVaultBalance(b ?? 0); })
      .catch(() => { if (!cancelled) setVaultBalance(0); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, publicKey, generatedPubkey, connection]);

  // Open interest from Market account
  useEffect(() => {
    const SKIN_TO_INDEX: Record<string, string> = {
      'awp-index': 'AWP', 'ak47-index': 'AK47',
      'knife-index': 'KNIFE', 'glove-index': 'GLOVE', 'cs500-index': 'CS500',
    };
    const indexId = SKIN_TO_INDEX[skinId];
    if (!indexId) return;
    let cancelled = false;
    (async () => {
      try {
        const priceFeedPda = findPriceFeedPda(indexId);
        const [marketPda] = PublicKey.findProgramAddressSync(
          [Buffer.from('market'), priceFeedPda.toBuffer()],
          PROGRAM_ID,
        );
        const info = await connection.getAccountInfo(marketPda);
        if (!info || cancelled) return;
        // Market layout: 8(disc) + 32(authority) + 32(skin_id len+str... variable) — use IDL offset
        // Offsets: disc=8, authority=32, skin_id string (4+max64=68), price_feed=32
        // total_long_open_interest offset = 8+32+68+32 = 140
        // total_short_open_interest offset = 140+8 = 148
        const data = info.data;
        if (data.length < 156) return;
        const longRaw  = new BN(Array.from(data.slice(140, 148)), 'le');
        const shortRaw = new BN(Array.from(data.slice(148, 156)), 'le');
        if (!cancelled) {
          setLongOI(longRaw.toNumber() / 1_000_000);
          setShortOI(shortRaw.toNumber() / 1_000_000);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [skinId, connection]);

  // Check for an existing open position on this market (real-wallet users only)
  useEffect(() => {
    if (!signerPubkey || !isMarketConfigured(skinId)) {
      setExistingPos(null);
      return;
    }
    let cancelled = false;

    const check = async () => {
      try {
        const priceFeed   = getPriceFeed(skinId);
        const marketPda   = findMarketPda(priceFeed);
        const positionPda = findPositionPda(signerPubkey, marketPda);
        const info        = await connection.getAccountInfo(positionPda);

        if (cancelled) return;
        if (!info || info.data.length < 138 || !POSITION_DISC.every((b, i) => info.data[i] === b)) {
          setExistingPos(null);
          return;
        }

        const d = info.data;
        const u64 = (off: number) =>
          new BN(Array.from(d.slice(off, off + 8)), 'le').toNumber() / 1_000_000;

        setExistingPos({
          side:             d[72] === 1 ? 'long' : 'short',
          collateral:       u64(73),
          size:             u64(81),
          entryPrice:       u64(97),
          liquidationPrice: u64(105),
        });
      } catch {
        if (!cancelled) setExistingPos(null);
      }
    };

    check();
    const timer = setInterval(check, 30_000);
    return () => { cancelled = true; clearInterval(timer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signerPubkey, skinId, connection]);

  // AVAIL = vault balance for any keyed user; simulated store balance for pure guests
  const availBalance = signerPubkey ? (vaultBalance ?? 0) : usdcBalance;

  const entryPrice = orderType === 'market'
    ? markPrice * (1 + (side === 'long' ? 0.00015 : -0.00015))
    : parseFloat(limitPrice) || markPrice;

  const col      = parseFloat(collateral) || 0;
  const notional = calcNotional(col, leverage);
  const size     = notional / entryPrice;                  // units of asset
  const fee      = col > 0 ? calcTakerFee(notional) : 0; // 0.2% of notional
  const liqPrice = calcLiquidationPrice(side, entryPrice, leverage);

  // 5% maintenance margin threshold — if net collateral after fee < threshold, position
  // would be liquidated at entry. Detect so we can warn and block submission.
  const LIQ_THRESHOLD_PCT     = 0.05;
  const immediatelyLiquidated = col > 0 && (col - fee) < (notional * LIQ_THRESHOLD_PCT);

  const setColPct = useCallback((pct: number) => {
    setCollateral((availBalance * pct).toFixed(2));
  }, [availBalance]);

  const handleReview = () => {
    if (col <= 0 || immediatelyLiquidated) return;
    setFeedback(null);
    setShowReview(true);
  };

  const handleConfirm = async () => {
    // ── Path 1: Phantom wallet — requires wallet popup ──────────────────────
    if (connected && publicKey && program && isMarketConfigured(skinId)) {
      setIsSubmitting(true);

      let accountExists: boolean;
      try {
        accountExists = (await fetchUserAccountBalance(connection, publicKey)) !== null;
      } catch {
        accountExists = false;
      }
      if (!accountExists) {
        setIsSubmitting(false);
        setShowReview(false);
        setFeedback({ ok: false, msg: 'One-time activation needed — deposit any amount to enable trading' });
        setShowDeposit(true);
        setTimeout(() => setFeedback(null), 6_000);
        return;
      }

      try {
        const sig = await sendOpenPosition(program, publicKey, {
          skinId, isLong: side === 'long', collateral: col, leverage, markPrice: entryPrice,
        });
        const priceFeed   = getPriceFeed(skinId);
        const marketPda   = findMarketPda(priceFeed);
        const positionPda = findPositionPda(publicKey, marketPda);
        setShowReview(false);
        setCollateral('');
        addToast({ txSig: sig, action: 'open', side, skinName, leverage, notional, entryPrice });
        fireReferralTrack(notional, fee);
        // Pass vaultBalance as override so the store guard uses the live on-chain
        // balance — not the stale simulation usdcBalance — when recording the position.
        openPosition({ skinId, skin, side, collateral: col, leverage, entryPrice, txSignature: sig, positionPda: positionPda.toBase58(), balanceOverride: vaultBalance ?? availBalance });
        fetchUserAccountBalance(connection, publicKey)
          .then(b => { if (b !== null) setVaultBalance(b); })
          .catch(() => {});
      } catch (err) {
        setShowReview(false);
        setFeedback({ ok: false, msg: extractErrorMessage(err) });
        setTimeout(() => setFeedback(null), 6_000);
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // ── Path 2: Generated wallet — signs silently with local keypair ────────
    if (user?.type === 'generated' && isMarketConfigured(skinId)) {
      setIsSubmitting(true);
      try {
        const kpRaw = localStorage.getItem('guest_keypair');
        if (!kpRaw) throw new Error('No trading keypair found — try logging out and back in');
        const signer = Keypair.fromSecretKey(decodeBase58(kpRaw));
        const owner  = signer.publicKey;

        const accountExists = (await fetchUserAccountBalance(connection, owner)) !== null;
        if (!accountExists) {
          setIsSubmitting(false);
          setShowReview(false);
          setFeedback({ ok: false, msg: 'Deposit USDC first to activate your account' });
          setShowDeposit(true);
          setTimeout(() => setFeedback(null), 6_000);
          return;
        }

        const sig = await sendOpenPositionKeypair(connection, signer, {
          skinId, isLong: side === 'long', collateral: col, leverage, markPrice: entryPrice,
        });
        const priceFeed   = getPriceFeed(skinId);
        const marketPda   = findMarketPda(priceFeed);
        const positionPda = findPositionPda(owner, marketPda);
        setShowReview(false);
        setCollateral('');
        addToast({ txSig: sig, action: 'open', side, skinName, leverage, notional, entryPrice });
        fireReferralTrack(notional, fee);
        openPosition({ skinId, skin, side, collateral: col, leverage, entryPrice, txSignature: sig, positionPda: positionPda.toBase58(), balanceOverride: vaultBalance ?? availBalance });
        fetchUserAccountBalance(connection, owner)
          .then(b => { if (b !== null) setVaultBalance(b); })
          .catch(() => {});
      } catch (err) {
        setShowReview(false);
        setFeedback({ ok: false, msg: extractErrorMessage(err) });
        setTimeout(() => setFeedback(null), 6_000);
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // ── Path 3: Pure simulation (no keypair, no wallet) ─────────────────────
    setShowReview(false);

    // For wallet users who fell through (e.g. market not yet on-chain), fetch the
    // live on-chain balance so the guard matches what AVAIL displays — not the
    // stale store value that may differ from the actual UserAccount balance.
    let guardBalance: number | undefined;
    if (signerPubkey) {
      try {
        const b = await fetchUserAccountBalance(connection, signerPubkey);
        if (b !== null) guardBalance = b;
      } catch {}
    }

    const result = openPosition({ skinId, skin, side, collateral: col, leverage, entryPrice, balanceOverride: guardBalance });
    if (result.success) {
      setCollateral('');
      setFeedback({ ok: true, msg: '✓ Position opened (simulation)' });
    } else {
      setFeedback({ ok: false, msg: result.error });
    }
    setTimeout(() => setFeedback(null), 4_000);
  };

  const handleCloseExisting = useCallback(async () => {
    if (!signerPubkey || !existingPos) return;
    setClosingExisting(true);
    setFeedback(null);
    try {
      if (connected && publicKey && program && isMarketConfigured(skinId)) {
        const sig = await sendClosePosition(program, publicKey, skinId);
        addToast({ txSig: sig, action: 'close', skinName, side: existingPos.side });
      } else if (user?.type === 'generated') {
        const kpRaw = localStorage.getItem('guest_keypair');
        if (!kpRaw) throw new Error('No trading keypair found');
        const signer = Keypair.fromSecretKey(decodeBase58(kpRaw));
        const sig    = await sendClosePositionKeypair(connection, signer, skinId);
        addToast({ txSig: sig, action: 'close', skinName, side: existingPos.side });
      } else {
        throw new Error('Wallet not available');
      }
      setExistingPos(null);
      setCloseConfirm(false);
      // Refresh vault balance after close settles
      if (signerPubkey) {
        fetchUserAccountBalance(connection, signerPubkey)
          .then(b => { if (b !== null) setVaultBalance(b); })
          .catch(() => {});
      }
    } catch (err) {
      setFeedback({ ok: false, msg: extractErrorMessage(err) });
      setTimeout(() => setFeedback(null), 6_000);
      setCloseConfirm(false);
    } finally {
      setClosingExisting(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signerPubkey, existingPos, connected, publicKey, program, user, skinId, connection]);

  const isLong   = side === 'long';
  // Also block open when user already has a position on this market (program uses `init`)
  const canTrade = col > 0 && col + fee <= availBalance && !immediatelyLiquidated && !existingPos;
  const hasUsdc  = availBalance > 0;
  const levPct   = ((leverage - 1) / 19) * 100;

  // Live PnL for the existing position card
  const existingPnl = existingPos
    ? existingPos.side === 'long'
      ? (markPrice - existingPos.entryPrice) * existingPos.size
      : (existingPos.entryPrice - markPrice) * existingPos.size
    : 0;
  const existingPnlPct = existingPos && existingPos.collateral > 0
    ? (existingPnl / existingPos.collateral) * 100
    : 0;
  const existingPnlPositive = existingPnl >= 0;

  return (
    <>
      <div className="bg-tx-surface border border-tx-border rounded overflow-hidden">

        {/* ── Long / Short ── */}
        <div className="grid grid-cols-2">
          <button
            onClick={() => setSide('long')}
            className={`py-2.5 text-[11px] font-mono uppercase tracking-[0.08em] font-bold transition-colors ${
              isLong ? 'bg-tx-green text-tx-bg' : 'bg-tx-raised text-tx-dim hover:text-tx-muted'
            }`}
          >
            Long
          </button>
          <button
            onClick={() => setSide('short')}
            className={`py-2.5 text-[11px] font-mono uppercase tracking-[0.08em] font-bold transition-colors ${
              !isLong ? 'bg-tx-red text-white' : 'bg-tx-raised text-tx-dim hover:text-tx-muted'
            }`}
          >
            Short
          </button>
        </div>

        {/* ── OI tracker ── */}
        {(() => {
          const total = longOI + shortOI;
          if (total === 0) return (
            <div className="px-3 py-1.5 bg-tx-bg border-b border-tx-border text-center">
              <span className="text-[10px] font-mono text-tx-dim">No open interest yet</span>
            </div>
          );
          const longPct  = Math.round((longOI  / total) * 100);
          const shortPct = 100 - longPct;
          const fmtOI = (n: number) => n >= 1000 ? `$${(n/1000).toFixed(1)}K` : `$${n.toFixed(0)}`;
          return (
            <div className="px-3 py-2 bg-tx-bg border-b border-tx-border">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-mono text-tx-green font-bold">LONG {longPct}%</span>
                <span className="text-[10px] font-mono text-tx-red font-bold">SHORT {shortPct}%</span>
              </div>
              <div className="h-1.5 flex rounded-sm overflow-hidden">
                <div className="bg-tx-green transition-all" style={{ width: `${longPct}%` }} />
                <div className="bg-tx-red transition-all" style={{ width: `${shortPct}%` }} />
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[9px] font-mono text-tx-dim tabular-nums">L: {fmtOI(longOI)}</span>
                <span className="text-[9px] font-mono text-tx-dim tabular-nums">S: {fmtOI(shortOI)}</span>
              </div>
            </div>
          );
        })()}

        {/* ── Balance bar ── */}
        <div className="px-3 py-2 bg-tx-bg border-b border-tx-border flex items-center justify-between text-[10px] font-mono">
          <span>
            <span className="text-tx-dim uppercase tracking-wider">Avail </span>
            <span className="text-tx-text tabular-nums">${availBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            <span className="text-tx-dim ml-1">USDC</span>
          </span>
          <span>
            <span className="text-tx-dim uppercase tracking-wider">Wallet </span>
            <span className="text-tx-text tabular-nums">{walletUsdcBalance === null ? '…' : walletUsdcBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            <span className="text-tx-dim ml-1">USDC</span>
          </span>
        </div>

        <div className="p-3 space-y-3">

          {/* ── Existing position card ── */}
          {existingPos && (
            <div className="border border-tx-border rounded-sm overflow-hidden">
              {/* Header */}
              <div className="px-3 py-2 bg-tx-raised border-b border-tx-border flex items-center justify-between">
                <span className="text-[9px] font-mono uppercase tracking-[0.1em] text-tx-dim">Current Position</span>
                <span className={`text-[9px] font-mono font-bold uppercase px-2 py-0.5 border ${
                  existingPos.side === 'long'
                    ? 'bg-tx-green/10 border-tx-green/20 text-tx-green'
                    : 'bg-tx-red/10 border-tx-red/20 text-tx-red'
                }`}>
                  {existingPos.side === 'long' ? '▲ LONG' : '▼ SHORT'}
                </span>
              </div>

              {/* Stats */}
              <div className="px-3 py-2 space-y-1.5">
                <Row label="Entry"  value={`$${fmtPrice(existingPos.entryPrice)}`} />
                <Row label="Mark"   value={`$${fmtPrice(markPrice)}`} />
                <Row
                  label="PnL"
                  value={`${existingPnlPositive ? '+' : ''}$${existingPnl.toFixed(2)} (${existingPnlPositive ? '+' : ''}${existingPnlPct.toFixed(2)}%)`}
                  valueClass={existingPnlPositive ? 'text-tx-green font-bold' : 'text-tx-red font-bold'}
                />
                <Row
                  label="Liq"
                  value={`$${fmtPrice(existingPos.liquidationPrice)}`}
                  valueClass="text-tx-red/60"
                />
                <Row label="Margin" value={`$${existingPos.collateral.toFixed(2)}`} />
              </div>

              {/* Close button */}
              <div className="px-3 pb-3">
                {closingExisting ? (
                  <div className="w-full py-1.5 text-center text-[10px] font-mono text-tx-dim">Closing…</div>
                ) : closeConfirm ? (
                  <div className="flex gap-2">
                    <button
                      onClick={handleCloseExisting}
                      className="flex-1 py-1.5 text-[10px] font-mono uppercase tracking-wider font-bold rounded-sm bg-tx-red/10 text-tx-red border border-tx-red/30 hover:bg-tx-red/20 transition-colors"
                    >
                      Confirm Close
                    </button>
                    <button
                      onClick={() => setCloseConfirm(false)}
                      className="px-3 py-1.5 text-[10px] font-mono text-tx-dim hover:text-tx-text transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setCloseConfirm(true)}
                    className="w-full py-1.5 text-[10px] font-mono uppercase tracking-wider font-bold rounded-sm bg-tx-raised text-tx-muted border border-tx-border hover:bg-tx-red/10 hover:text-tx-red hover:border-tx-red/30 transition-colors"
                  >
                    Close Position
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── Order type ── */}
          <div className="flex gap-px bg-tx-border rounded-sm overflow-hidden">
            {(['market', 'limit', 'stop'] as OrderType[]).map(t => (
              <button
                key={t}
                onClick={() => setOrderType(t)}
                className={`flex-1 py-1.5 text-[10px] font-mono uppercase tracking-[0.06em] transition-colors ${
                  orderType === t ? 'bg-tx-raised text-tx-text' : 'bg-tx-surface text-tx-dim hover:text-tx-muted'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* ── Limit / Stop price ── */}
          {(orderType === 'limit' || orderType === 'stop') && (
            <label className="block">
              <span className={`${labelCls} block mb-1`}>
                {orderType === 'limit' ? 'Limit Price' : 'Stop Trigger'}
              </span>
              <div className="relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-tx-dim">$</span>
                <input
                  type="number"
                  value={limitPrice}
                  onChange={e => setLimitPrice(e.target.value)}
                  placeholder={markPrice.toFixed(2)}
                  className={inputCls}
                />
              </div>
            </label>
          )}

          {/* ── Collateral ── */}
          <label className="block">
            <div className="flex justify-between mb-1">
              <span className={labelCls}>Collateral</span>
              <span className="text-[10px] font-mono text-tx-dim tabular-nums">
                ${availBalance.toFixed(2)} USDC
              </span>
            </div>
            <div className="relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-tx-dim">$</span>
              <input
                type="number"
                value={collateral}
                onChange={e => setCollateral(e.target.value)}
                placeholder="0.00"
                className={`${inputCls} pr-14`}
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-mono uppercase tracking-wider text-tx-dim">USDC</span>
            </div>
            <div className="flex gap-px mt-1.5 bg-tx-border rounded-sm overflow-hidden">
              {([0.25, 0.5, 0.75, 1] as const).map(pct => (
                <button
                  key={pct}
                  onClick={() => setColPct(pct)}
                  className="flex-1 py-1 text-[10px] font-mono text-tx-dim bg-tx-surface hover:bg-tx-raised hover:text-tx-muted transition-colors uppercase tracking-wider"
                >
                  {pct === 1 ? 'Max' : `${pct * 100}%`}
                </button>
              ))}
            </div>
          </label>

          {/* ── Leverage ── */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className={labelCls}>Leverage</span>
              <span className={`text-[11px] font-mono font-bold tabular-nums ${leverage >= 10 ? 'text-tx-red' : 'text-tx-green'}`}>
                {leverage}×
              </span>
            </div>

            <input
              type="range"
              min={1} max={20} step={1}
              value={leverage}
              onChange={e => setLeverage(Number(e.target.value))}
              className="w-full h-1 appearance-none outline-none cursor-pointer rounded-none"
              style={{
                background: `linear-gradient(to right, #00ff88 0%, #00ff88 ${levPct}%, #1e2025 ${levPct}%, #1e2025 100%)`,
              }}
            />

            <div className="flex justify-between mt-1.5 px-px">
              {LEV_MARKS.map(mark => (
                <button
                  key={mark}
                  onClick={() => setLeverage(mark)}
                  className={`text-[9px] font-mono transition-colors ${
                    leverage === mark ? 'text-tx-green font-bold' : 'text-tx-dim hover:text-tx-muted'
                  }`}
                >
                  {mark}×
                </button>
              ))}
            </div>

            <div className="flex gap-px mt-2 bg-tx-border rounded-sm overflow-hidden">
              {QUICK_LEVERAGES.map(l => (
                <button
                  key={l}
                  onClick={() => setLeverage(l)}
                  className={`flex-1 py-1.5 text-[10px] font-mono uppercase tracking-wider transition-colors ${
                    leverage === l
                      ? 'bg-tx-raised text-tx-green'
                      : 'bg-tx-surface text-tx-dim hover:text-tx-muted'
                  }`}
                >
                  {l}×
                </button>
              ))}
            </div>
          </div>

          {/* ── SL / TP ── */}
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className={`${labelCls} block mb-1`}>Stop Loss</span>
              <div className="relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-tx-dim">$</span>
                <input
                  type="number"
                  value={stopLoss}
                  onChange={e => setStopLoss(e.target.value)}
                  placeholder="—"
                  className={`${inputCls} focus:border-tx-red/60`}
                />
              </div>
            </label>
            <label className="block">
              <span className={`${labelCls} block mb-1`}>Take Profit</span>
              <div className="relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-tx-dim">$</span>
                <input
                  type="number"
                  value={takeProfit}
                  onChange={e => setTakeProfit(e.target.value)}
                  placeholder="—"
                  className={`${inputCls} focus:border-tx-green/60`}
                />
              </div>
            </label>
          </div>

          {/* ── Position summary ── */}
          <div className="bg-tx-bg border border-tx-border rounded-sm p-3 space-y-2">
            <Row label="Size"
              value={col > 0 ? `${size.toFixed(4)} ($${fmtPrice(notional)})` : '—'}
            />
            <Row label="Entry"      value={`$${fmtPrice(entryPrice)}`} />
            <Row label="Liq Price"
              value={immediatelyLiquidated ? '—' : `$${fmtPrice(liqPrice)}`}
              valueClass={immediatelyLiquidated ? 'text-tx-red' : isLong ? 'text-tx-red' : 'text-tx-green'}
            />
            <div className="border-t border-tx-border pt-2">
              <Row label="Fee (0.05%)" value={col > 0 ? `$${fee.toFixed(2)}` : '—'} dim />
            </div>
          </div>

          {/* ── Immediate liquidation warning ── */}
          {immediatelyLiquidated && col > 0 && (
            <div className="w-full py-2.5 px-3 rounded-sm text-[11px] font-mono font-bold text-center border bg-tx-red/10 text-tx-red border-tx-red/30">
              ⚠ Position would be immediately liquidated — reduce leverage or increase collateral
            </div>
          )}

          {/* ── Feedback ── */}
          {feedback && (
            <div className={`w-full py-2.5 rounded-sm text-[11px] font-mono font-bold text-center border ${
              feedback.ok
                ? 'bg-tx-green/10 text-tx-green border-tx-green/30'
                : 'bg-tx-red/10 text-tx-red border-tx-red/30'
            }`}>
              {feedback.msg}
            </div>
          )}

          {/* ── CTA ── */}
          {!feedback && (
            existingPos ? (
              <div className="w-full py-3 px-3 rounded-sm text-center border bg-tx-raised border-tx-border space-y-1">
                <p className="text-[11px] font-mono text-tx-muted">
                  Position already open on this market.
                </p>
                <p className="text-[10px] font-mono text-tx-dim">
                  Close it above or in Portfolio before opening a new one.
                </p>
                <Link
                  href="/portfolio"
                  className="inline-block mt-1 text-[10px] font-mono uppercase tracking-wider text-tx-green hover:text-[#00e87a] transition-colors"
                >
                  → Go to Portfolio
                </Link>
              </div>
            ) : hasUsdc ? (
              <button
                onClick={handleReview}
                disabled={!canTrade}
                className={`w-full py-2.5 rounded-sm text-[11px] font-mono uppercase tracking-[0.08em] font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                  isLong
                    ? 'bg-tx-green text-tx-bg hover:bg-[#00e87a]'
                    : 'bg-tx-red text-white hover:bg-[#e03e3e]'
                }`}
              >
                Open {isLong ? 'Long' : 'Short'} {orderType}
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setShowSwap(true)}
                  className="py-2.5 rounded-sm bg-tx-bg border border-tx-border2 text-tx-muted text-[10px] font-mono uppercase tracking-wider hover:border-tx-green hover:text-tx-green transition-colors"
                >
                  Swap SOL→USDC
                </button>
                <button
                  onClick={() => setShowDeposit(true)}
                  className="py-2.5 rounded-sm bg-tx-bg border border-tx-border2 text-tx-muted text-[10px] font-mono uppercase tracking-wider hover:border-tx-green hover:text-tx-green transition-colors"
                >
                  Deposit
                </button>
              </div>
            )
          )}

        </div>
      </div>

      {showDeposit && (
        <DepositModal
          onClose={() => setShowDeposit(false)}
          program={program}
          publicKey={publicKey}
          onSuccess={(newVaultBal) => setVaultBalance(newVaultBal)}
        />
      )}
      {showSwap && sessionAddress && (
        <SwapModal
          address={sessionAddress}
          solBalance={solBalance ?? 0}
          onClose={() => setShowSwap(false)}
          onSuccess={(newSol) => {
            setSolBalance(newSol);
            if (signerPubkey) {
              connection.getParsedTokenAccountsByOwner(signerPubkey, { mint: USDC_MINT })
                .then(res => {
                  const accts = res.value;
                  setWalletUsdcBalance(accts.length > 0
                    ? ((accts[0].account.data.parsed.info.tokenAmount.uiAmount as number) ?? 0)
                    : 0);
                })
                .catch(() => {});
            }
          }}
        />
      )}
      {showReview && (
        <ReviewModal
          side={side} skinName={skinName} orderType={orderType} leverage={leverage}
          collateral={col} notional={notional} positionSize={size} entryPrice={entryPrice}
          liqPrice={liqPrice} takerFee={fee} isSubmitting={isSubmitting}
          onConfirm={handleConfirm}
          onClose={() => { if (!isSubmitting) setShowReview(false); }}
        />
      )}
    </>
  );
}

function Row({ label, value, valueClass, dim }: {
  label: string; value: string; valueClass?: string; dim?: boolean;
}) {
  return (
    <div className="flex justify-between items-center">
      <span className={`text-[10px] font-mono uppercase tracking-[0.06em] ${dim ? 'text-tx-dim' : 'text-tx-muted'}`}>{label}</span>
      <span className={`text-[11px] font-mono tabular-nums ${valueClass ?? (dim ? 'text-tx-dim' : 'text-tx-text')}`}>
        {value}
      </span>
    </div>
  );
}

function DepositModal({
  onClose,
  program,
  publicKey,
  onSuccess,
}: {
  onClose: () => void;
  program: Program | null;
  publicKey: PublicKey | null;
  onSuccess: (newVaultBalance: number) => void;
}) {
  const { connection } = useConnection();
  const { user }       = useAuth();
  const [tab,          setTab]        = useState<'deposit' | 'withdraw'>('deposit');
  const [amount,       setAmount]     = useState('');
  const [walletUsdc,   setWalletUsdc] = useState<number | null>(null);
  const [deposited,    setDeposited]  = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback,     setFeedback]   = useState<{ ok: boolean; msg: string } | null>(null);

  // Resolve the signer's public key across Phantom and session wallets
  const isSessionWallet = user?.type === 'generated';
  const effectivePubkey: PublicKey | null =
    publicKey ??
    (isSessionWallet && user?.address ? new PublicKey(user.address) : null);

  // Fetch both wallet USDC and current vault balance on open
  useEffect(() => {
    if (!effectivePubkey) return;
    connection.getParsedTokenAccountsByOwner(effectivePubkey, { mint: USDC_MINT })
      .then(res => {
        const accts = res.value;
        setWalletUsdc(accts.length > 0
          ? ((accts[0].account.data.parsed.info.tokenAmount.uiAmount as number) ?? 0)
          : 0);
      })
      .catch(() => setWalletUsdc(0));
    fetchUserAccountBalance(connection, effectivePubkey)
      .then(b => setDeposited(b ?? 0))
      .catch(() => setDeposited(0));
  }, [effectivePubkey?.toBase58(), connection]); // eslint-disable-line react-hooks/exhaustive-deps

  const maxAmount = tab === 'deposit' ? (walletUsdc ?? 0) : (deposited ?? 0);
  const hasWallet = !!(program && publicKey) || isSessionWallet;

  async function handleSubmit() {
    const val = parseFloat(amount);
    if (!val || val <= 0 || !effectivePubkey) return;
    setIsSubmitting(true);
    setFeedback(null);
    try {
      if (program && publicKey) {
        // Phantom path
        if (tab === 'deposit') await sendDeposit(program, publicKey, val);
        else                   await sendWithdraw(program, publicKey, val);
      } else if (isSessionWallet) {
        // Session keypair path
        const kpRaw = localStorage.getItem('guest_keypair');
        if (!kpRaw) throw new Error('Session keypair not found — try logging out and back in');
        const signer = Keypair.fromSecretKey(decodeBase58(kpRaw));
        if (tab === 'deposit') await sendDepositKeypair(connection, signer, val);
        else                   await sendWithdrawKeypair(connection, signer, val);
      } else {
        throw new Error('No wallet connected');
      }
      // Refresh both balances after tx confirms
      const [vaultRes, tokenRes] = await Promise.allSettled([
        fetchUserAccountBalance(connection, effectivePubkey),
        connection.getParsedTokenAccountsByOwner(effectivePubkey, { mint: USDC_MINT }),
      ]);
      const newVault = vaultRes.status === 'fulfilled' ? (vaultRes.value ?? 0) : deposited ?? 0;
      let newWalletBal = walletUsdc ?? 0;
      if (tokenRes.status === 'fulfilled') {
        const accts = tokenRes.value.value;
        newWalletBal = accts.length > 0
          ? ((accts[0].account.data.parsed.info.tokenAmount.uiAmount as number) ?? 0)
          : 0;
        setWalletUsdc(newWalletBal);
      }
      setDeposited(newVault);
      setAmount('');
      setFeedback({ ok: true, msg: `✓ ${tab === 'deposit' ? 'Deposited' : 'Withdrawn'} $${val.toFixed(2)} USDC` });
      onSuccess(newVault);
      setTimeout(() => setFeedback(null), 3_000);
    } catch (err) {
      setFeedback({ ok: false, msg: extractErrorMessage(err) });
      setTimeout(() => setFeedback(null), 6_000);
    } finally {
      setIsSubmitting(false);
    }
  }

  const val       = parseFloat(amount) || 0;
  const canSubmit = !isSubmitting && hasWallet && val > 0 && val <= maxAmount;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-tx-surface border border-tx-border rounded overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-tx-border">
          <h2 className="text-[11px] font-mono uppercase tracking-[0.08em] text-tx-muted">Margin Account</h2>
          <button onClick={onClose} className="text-tx-dim hover:text-tx-text transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Balance summary */}
        <div className="grid grid-cols-2 border-b border-tx-border">
          <div className="px-4 py-3">
            <div className="text-[10px] font-mono uppercase tracking-wider text-tx-dim mb-0.5">Wallet</div>
            <div className="text-[13px] font-mono tabular-nums text-tx-text">
              {walletUsdc === null ? '…' : walletUsdc.toFixed(2)}
              <span className="text-[10px] text-tx-dim ml-1">USDC</span>
            </div>
          </div>
          <div className="px-4 py-3 border-l border-tx-border">
            <div className="text-[10px] font-mono uppercase tracking-wider text-tx-dim mb-0.5">Deposited</div>
            <div className="text-[13px] font-mono tabular-nums text-tx-green">
              {deposited === null ? '…' : deposited.toFixed(2)}
              <span className="text-[10px] text-tx-dim ml-1">USDC</span>
            </div>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-px bg-tx-border m-3 mb-0 rounded-sm overflow-hidden">
          {(['deposit', 'withdraw'] as const).map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); setAmount(''); setFeedback(null); }}
              className={`flex-1 py-1.5 text-[10px] font-mono uppercase tracking-wider transition-colors ${
                tab === t ? 'bg-tx-raised text-tx-text' : 'bg-tx-surface text-tx-dim hover:text-tx-muted'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="p-4 space-y-3">
          {!hasWallet ? (
            <p className="text-[11px] font-mono text-tx-dim text-center py-3">
              Connect a wallet to deposit USDC.
            </p>
          ) : (
            <>
              <label className="block">
                <div className="flex justify-between mb-1">
                  <span className="text-[10px] font-mono uppercase tracking-[0.08em] text-tx-dim">Amount (USDC)</span>
                  <button
                    className="text-[10px] font-mono text-tx-dim hover:text-tx-text transition-colors"
                    onClick={() => setAmount(maxAmount.toFixed(2))}
                  >
                    Max {maxAmount.toFixed(2)}
                  </button>
                </div>
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-tx-dim">$</span>
                  <input
                    type="number" min="0" step="any"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-tx-bg border border-tx-border2 rounded-sm pl-5 pr-3 py-2 text-[12px] text-tx-text placeholder-tx-dim font-mono focus:outline-none focus:border-tx-muted transition-colors"
                  />
                </div>
              </label>

              {feedback && (
                <div className={`py-2 rounded-sm text-[11px] font-mono font-bold text-center border ${
                  feedback.ok
                    ? 'bg-tx-green/10 text-tx-green border-tx-green/30'
                    : 'bg-tx-red/10 text-tx-red border-tx-red/30'
                }`}>
                  {feedback.msg}
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="w-full py-2.5 rounded-sm text-[11px] font-mono uppercase tracking-wider font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-tx-raised text-tx-text hover:bg-tx-border2"
              >
                {isSubmitting ? 'Confirming…' : tab === 'deposit' ? 'Deposit USDC' : 'Withdraw USDC'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
