'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { BN } from '@coral-xyz/anchor';
import { Keypair, PublicKey } from '@solana/web3.js';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchLpPosition,
  fetchWalletUsdcBalance,
  sendAddLiquidityKeypair,
  sendRemoveLiquidityKeypair,
  sendAddLiquidity,
  sendRemoveLiquidity,
  getProgram,
} from '@/lib/program';

interface PoolStats {
  initialized:  boolean;
  totalUsdc:    number;
  lpSupply:     number;
  feesEarned:   number;
  apr7d:        number;
  sharePrice:   number;
}

interface OracleStatus {
  longOI:   number;
  shortOI:  number;
  healthy:  boolean;
}

function fmtUSD(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

function fmtShort(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function usePoolStats() {
  const [pool, setPool] = useState<PoolStats | null>(null);
  useEffect(() => {
    const fetch_ = () =>
      fetch('/api/pool/stats').then(r => r.json()).then(setPool).catch(() => {});
    fetch_();
    const id = setInterval(fetch_, 30_000);
    return () => clearInterval(id);
  }, []);
  return pool;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-tx-surface border border-tx-border p-5">
      <h2 className="text-[9px] font-mono uppercase tracking-[0.12em] text-tx-dim mb-4">{title}</h2>
      {children}
    </div>
  );
}

function StatRow({ label, value, valueClass = 'text-tx-text' }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-tx-border last:border-0">
      <span className="text-[11px] font-mono text-tx-muted">{label}</span>
      <span className={`text-[11px] font-mono font-bold tabular-nums ${valueClass}`}>{value}</span>
    </div>
  );
}

export default function PoolPage() {
  const [depositAmt,  setDepositAmt]  = useState('');
  const [withdrawAmt, setWithdrawAmt] = useState('');
  const [txStatus,    setTxStatus]    = useState<string | null>(null);
  const [oracleData,  setOracleData]  = useState<Record<string, OracleStatus>>({});

  const pool = usePoolStats();

  const walletCtx                        = useWallet();
  const { connected, publicKey, wallet } = walletCtx;
  const { connection }                   = useConnection();
  const { user, getKeypair }             = useAuth();

  const generatedPubkey = useMemo(
    () => user?.type === 'generated' ? new PublicKey(user.address) : null,
    [user],
  );
  const signerPubkey = useMemo(
    () => (connected && publicKey) ? publicKey : generatedPubkey,
    [connected, publicKey, generatedPubkey],
  );

  // Wallet ATA USDC balance (what can be deposited into LP)
  const [walletUsdc, setWalletUsdc] = useState<number | null>(null);

  // User's LP position on-chain
  const [lpPos, setLpPos] = useState<{ lpTokens: number; depositedAt: Date } | null>(null);

  const refreshBalances = useCallback(async () => {
    if (!signerPubkey) { setWalletUsdc(null); setLpPos(null); return; }
    const [bal, lp] = await Promise.allSettled([
      fetchWalletUsdcBalance(connection, signerPubkey),
      fetchLpPosition(connection, signerPubkey),
    ]);
    setWalletUsdc(bal.status === 'fulfilled' ? bal.value : null);
    setLpPos(lp.status === 'fulfilled' ? lp.value : null);
  }, [signerPubkey, connection]);

  useEffect(() => { refreshBalances(); }, [refreshBalances]);

  // Oracle status for open interest aggregation
  useEffect(() => {
    fetch('/api/oracle-status').then(r => r.json()).then(setOracleData).catch(() => {});
    const id = setInterval(() => {
      fetch('/api/oracle-status').then(r => r.json()).then(setOracleData).catch(() => {});
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  const totalLongOI  = Object.values(oracleData).reduce((s, o) => s + (o.longOI  ?? 0), 0);
  const totalShortOI = Object.values(oracleData).reduce((s, o) => s + (o.shortOI ?? 0), 0);
  const totalOI      = totalLongOI + totalShortOI;
  const longPct      = totalOI > 0 ? Math.round((totalLongOI / totalOI) * 100) : 50;

  // Derived LP stats
  const sharePrice   = pool?.sharePrice ?? 1;
  const lpSupply     = pool?.lpSupply   ?? 0;
  const userLpValue  = lpPos ? lpPos.lpTokens * sharePrice : 0;
  const userSharePct = lpSupply > 0 && lpPos
    ? ((lpPos.lpTokens / (lpSupply / 1_000_000)) * 100)
    : 0;

  // 24h LP cooldown remaining
  const cooldownRemaining = useMemo(() => {
    if (!lpPos) return 0;
    const cooldownEnd = lpPos.depositedAt.getTime() + 24 * 3600 * 1000;
    return Math.max(0, Math.ceil((cooldownEnd - Date.now()) / (3600 * 1000)));
  }, [lpPos]);

  // Convert user's requested USDC withdrawal to LP tokens
  const withdrawLpTokens = useMemo((): BN => {
    const usd = parseFloat(withdrawAmt);
    if (!usd || !pool || pool.sharePrice <= 0) return new BN(0);
    const raw = Math.round((usd / pool.sharePrice) * 1_000_000);
    const maxRaw = lpPos ? Math.round(lpPos.lpTokens * 1_000_000) : 0;
    return new BN(Math.min(raw, maxRaw));
  }, [withdrawAmt, pool, lpPos]);

  const getSigner = useCallback((): Keypair | null => {
    return getKeypair();
  }, [getKeypair]);

  const handleDeposit = useCallback(async () => {
    const amt = parseFloat(depositAmt);
    if (!amt || amt <= 0) return;
    setTxStatus('Depositing…');
    try {
      if (connected && publicKey && wallet?.adapter) {
        const prog = getProgram(connection, walletCtx);
        await sendAddLiquidity(prog, publicKey, amt);
      } else {
        const signer = getSigner();
        if (!signer) throw new Error('No session keypair');
        await sendAddLiquidityKeypair(connection, signer, amt);
      }
      setTxStatus('Deposited!');
      setDepositAmt('');
      await refreshBalances();
    } catch (e) {
      setTxStatus((e as Error).message.slice(0, 80));
    } finally {
      setTimeout(() => setTxStatus(null), 5000);
    }
  }, [depositAmt, connected, publicKey, wallet, connection, getSigner, refreshBalances]);

  const handleWithdraw = useCallback(async () => {
    if (withdrawLpTokens.isZero()) return;
    if (cooldownRemaining > 0) {
      setTxStatus(`Cooldown active — ${cooldownRemaining}h remaining`);
      setTimeout(() => setTxStatus(null), 4000);
      return;
    }
    setTxStatus('Withdrawing…');
    try {
      if (connected && publicKey && wallet?.adapter) {
        const prog = getProgram(connection, walletCtx);
        await sendRemoveLiquidity(prog, publicKey, withdrawLpTokens);
      } else {
        const signer = getSigner();
        if (!signer) throw new Error('No session keypair');
        await sendRemoveLiquidityKeypair(connection, signer, withdrawLpTokens);
      }
      setTxStatus('Withdrawn!');
      setWithdrawAmt('');
      await refreshBalances();
    } catch (e) {
      setTxStatus((e as Error).message.slice(0, 80));
    } finally {
      setTimeout(() => setTxStatus(null), 5000);
    }
  }, [withdrawLpTokens, cooldownRemaining, connected, publicKey, wallet, connection, getSigner, refreshBalances]);

  const handleClaimAll = useCallback(async () => {
    if (!lpPos || lpPos.lpTokens <= 0) return;
    if (cooldownRemaining > 0) {
      setTxStatus(`Cooldown active — ${cooldownRemaining}h remaining`);
      setTimeout(() => setTxStatus(null), 4000);
      return;
    }
    setTxStatus('Claiming…');
    try {
      const allLpTokens = new BN(Math.round(lpPos.lpTokens * 1_000_000));
      if (connected && publicKey && wallet?.adapter) {
        const prog = getProgram(connection, walletCtx);
        await sendRemoveLiquidity(prog, publicKey, allLpTokens);
      } else {
        const signer = getSigner();
        if (!signer) throw new Error('No session keypair');
        await sendRemoveLiquidityKeypair(connection, signer, allLpTokens);
      }
      setTxStatus('Claimed!');
      await refreshBalances();
    } catch (e) {
      setTxStatus((e as Error).message.slice(0, 80));
    } finally {
      setTimeout(() => setTxStatus(null), 5000);
    }
  }, [lpPos, cooldownRemaining, connected, publicKey, wallet, connection, getSigner, refreshBalances]);

  const tvl    = pool ? fmtUSD(pool.totalUsdc)  : '—';
  const fees   = pool ? fmtUSD(pool.feesEarned) : '—';
  const apr    = pool ? `${pool.apr7d.toFixed(1)}%` : '—';
  const shareP = pool ? `$${pool.sharePrice.toFixed(4)}` : '—';
  const totalSh = pool && pool.sharePrice > 0
    ? (pool.totalUsdc / pool.sharePrice).toFixed(2)
    : '—';

  const walletDisplay  = walletUsdc !== null ? fmtUSD(walletUsdc) : signerPubkey ? '…' : '$0.00';
  const lpValueDisplay = userLpValue > 0 ? fmtUSD(userLpValue) : lpPos !== null ? '$0.00' : '—';
  const shareDisplay   = userSharePct > 0 ? `${userSharePct.toFixed(4)}%` : '0.00%';

  return (
    <main className="min-h-screen bg-tx-bg px-4 py-6 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-4">

        <div>
          <h1 className="text-[13px] font-mono uppercase tracking-[0.08em] text-tx-text">Liquidity Pool</h1>
          <p className="text-[11px] font-mono text-tx-muted mt-1">Deposit USDC to provide liquidity and earn trading fees.</p>
        </div>

        {/* Top stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-tx-border rounded overflow-hidden">
          {[
            { label: 'Pool TVL',         value: tvl,          cls: 'text-tx-text'  },
            { label: 'Accumulated Fees', value: fees,         cls: 'text-tx-text'  },
            { label: 'APR 7d',           value: apr,          cls: 'text-tx-green' },
            { label: 'Your Share',       value: shareDisplay, cls: 'text-tx-text'  },
          ].map(({ label, value, cls }) => (
            <div key={label} className="bg-tx-surface px-4 py-3">
              <p className="text-[9px] font-mono uppercase tracking-[0.12em] text-tx-dim mb-1">{label}</p>
              <p className={`text-[18px] font-mono font-bold tabular-nums ${cls}`}>{value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-3 items-start">

          {/* Left column */}
          <div className="space-y-3">

            <Card title="Your LP Position">
              {lpPos && lpPos.lpTokens > 0 ? (
                <div className="space-y-2">
                  <StatRow label="LP Tokens"     value={lpPos.lpTokens.toFixed(4)} />
                  <StatRow label="Current Value" value={lpValueDisplay} valueClass="text-tx-green" />
                  <StatRow label="Share of Pool" value={shareDisplay} />
                  <StatRow
                    label="Cooldown"
                    value={cooldownRemaining > 0 ? `${cooldownRemaining}h remaining` : 'Ready to withdraw'}
                    valueClass={cooldownRemaining > 0 ? 'text-yellow-400' : 'text-tx-green'}
                  />
                  <p className="text-[10px] font-mono text-tx-dim mt-2 leading-relaxed">
                    Fees are embedded in the share price. Withdraw to realize your gains.
                  </p>
                </div>
              ) : (
                <div className="flex items-center justify-center py-5">
                  <p className="text-[11px] font-mono text-tx-dim text-center leading-relaxed">
                    No LP position yet.<br />Deposit USDC to start earning fees.
                  </p>
                </div>
              )}
            </Card>

            <Card title="Pool Stats">
              <StatRow label="Total USDC"       value={tvl} />
              <StatRow label="Total Shares"     value={totalSh} />
              <StatRow label="Share Price"      value={shareP} />
              <StatRow label="Accumulated Fees" value={fees} />
              <StatRow label="APR (7d)"         value={apr} valueClass="text-tx-green" />
            </Card>

            <Card title="LP Fee Sources">
              {[
                { name: 'Trading Fees',  desc: '50% of open & close fees'      },
                { name: 'Funding Fees',  desc: '70% of majority-side funding'   },
                { name: 'Liquidations', desc: '44% of liquidated collateral'    },
              ].map(({ name, desc }) => (
                <div key={name} className="flex items-start gap-3 py-2.5 border-b border-tx-border last:border-0">
                  <span className="mt-1 w-1.5 h-1.5 bg-tx-green shrink-0" />
                  <div>
                    <p className="text-[11px] font-mono text-tx-text">{name}</p>
                    <p className="text-[10px] font-mono text-tx-dim mt-0.5">{desc}</p>
                  </div>
                </div>
              ))}
            </Card>

            <Card title="Open Interest">
              {totalOI > 0 ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-tx-green">Long</span>
                    <span className="text-[14px] font-mono font-bold text-tx-green tabular-nums">{fmtShort(totalLongOI)}</span>
                  </div>
                  <div className="h-1.5 bg-tx-bg border border-tx-border overflow-hidden">
                    <div className="h-full bg-tx-green" style={{ width: `${longPct}%` }} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-tx-red">Short</span>
                    <span className="text-[14px] font-mono font-bold text-tx-red tabular-nums">{fmtShort(totalShortOI)}</span>
                  </div>
                  <p className="text-[9px] font-mono text-tx-dim tabular-nums pt-1">
                    Total: {fmtShort(totalOI)} · Long {longPct}% / Short {100 - longPct}%
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-tx-green">Long</span>
                    <span className="text-[14px] font-mono font-bold text-tx-green tabular-nums">—</span>
                  </div>
                  <div className="h-1.5 bg-tx-bg border border-tx-border" />
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-tx-red">Short</span>
                    <span className="text-[14px] font-mono font-bold text-tx-red tabular-nums">—</span>
                  </div>
                </div>
              )}
            </Card>

            <Card title="Protocol Vaults">
              <StatRow label="LP Vault"       value={tvl} />
              <StatRow label="Fee Vault"      value={fees} />
              <StatRow label="Insurance Fund" value="—" />
            </Card>
          </div>

          {/* Right column */}
          <div className="space-y-3">

            <Card title="Wallet">
              <StatRow label="USDC (wallet ATA)"  value={walletDisplay} />
              {lpPos && lpPos.lpTokens > 0 && (
                <StatRow label="LP Position Value" value={lpValueDisplay} valueClass="text-tx-green" />
              )}
            </Card>

            {txStatus && (
              <div className="px-4 py-2 bg-tx-raised border border-tx-border rounded-sm text-[11px] font-mono text-tx-muted">
                {txStatus}
              </div>
            )}

            {/* Deposit */}
            <Card title="Deposit">
              <div className="space-y-2.5">
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-tx-dim">Amount (USDC)</span>
                  <span className="text-[10px] font-mono text-tx-dim">Balance: {walletDisplay}</span>
                </div>
                <input
                  type="number" min="0" step="any"
                  value={depositAmt}
                  onChange={e => setDepositAmt(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-tx-bg border border-tx-border rounded-sm px-3 py-2 text-[12px] font-mono text-tx-text placeholder-tx-dim focus:outline-none focus:border-tx-border2 transition-colors"
                />
                <button
                  onClick={handleDeposit}
                  disabled={!depositAmt || parseFloat(depositAmt) <= 0}
                  className="w-full py-2.5 rounded-sm text-[11px] font-mono font-bold uppercase tracking-wider bg-tx-green text-tx-bg hover:bg-[#00e87a] disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.99]"
                >
                  Deposit to Pool
                </button>
              </div>
            </Card>

            {/* Withdraw */}
            <Card title="Withdraw">
              <div className="space-y-2.5">
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-tx-dim">Amount (USDC)</span>
                  <span className="text-[10px] font-mono text-tx-dim">Position: {lpValueDisplay}</span>
                </div>
                <input
                  type="number" min="0" step="any"
                  value={withdrawAmt}
                  onChange={e => setWithdrawAmt(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-tx-bg border border-tx-border rounded-sm px-3 py-2 text-[12px] font-mono text-tx-text placeholder-tx-dim focus:outline-none focus:border-tx-border2 transition-colors"
                />
                {cooldownRemaining > 0 && (
                  <p className="text-[10px] font-mono text-yellow-400">
                    24h cooldown: {cooldownRemaining}h remaining after deposit
                  </p>
                )}
                <button
                  onClick={handleWithdraw}
                  disabled={!withdrawAmt || parseFloat(withdrawAmt) <= 0 || cooldownRemaining > 0}
                  className="w-full py-2.5 rounded-sm text-[11px] font-mono font-bold uppercase tracking-wider bg-tx-bg border border-tx-border text-tx-muted hover:border-tx-border2 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.99]"
                >
                  Withdraw from Pool
                </button>
              </div>
            </Card>

            {/* Claim Fees (= withdraw all LP) */}
            <Card title="Claim Fees">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono text-tx-muted">Your LP value</span>
                  <span className="text-[11px] font-mono font-bold text-tx-green tabular-nums">{lpValueDisplay}</span>
                </div>
                <p className="text-[10px] font-mono text-tx-dim leading-relaxed">
                  Fees accumulate in the share price. Withdrawing your LP redeems all earnings.
                </p>
                <button
                  onClick={handleClaimAll}
                  disabled={!lpPos || lpPos.lpTokens <= 0 || cooldownRemaining > 0}
                  className="w-full py-2.5 rounded-sm text-[11px] font-mono font-bold uppercase tracking-wider border border-tx-green text-tx-green hover:bg-tx-green/10 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.99]"
                >
                  Withdraw All + Claim Fees
                </button>
              </div>
            </Card>

          </div>
        </div>
      </div>
    </main>
  );
}
