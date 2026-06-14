'use client';

import { useState, useEffect } from 'react';

interface PoolStats {
  initialized: boolean;
  totalUsdc:   number;
  feesEarned:  number;
  apr7d:       number;
  sharePrice:  number;
}

function useFmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

function usePoolStats() {
  const [pool, setPool] = useState<PoolStats | null>(null);
  useEffect(() => {
    fetch('/api/pool/stats')
      .then(r => r.json())
      .then(setPool)
      .catch(() => {});
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

function InputCard({
  title, label, sublabel, placeholder, btnLabel, btnClass, value, onChange,
}: {
  title: string; label: string; sublabel?: string; placeholder: string;
  btnLabel: string; btnClass: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <Card title={title}>
      <div className="space-y-2.5">
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] font-mono uppercase tracking-wider text-tx-dim">{label}</span>
          {sublabel && <span className="text-[10px] font-mono text-tx-dim">{sublabel}</span>}
        </div>
        <input
          type="number"
          min="0"
          step="any"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-tx-bg border border-tx-border rounded-sm px-3 py-2 text-[12px] font-mono text-tx-text placeholder-tx-dim focus:outline-none focus:border-tx-border2 transition-colors"
        />
        <button className={`w-full py-2.5 rounded-sm text-[11px] font-mono font-bold uppercase tracking-wider transition-all active:scale-[0.99] ${btnClass}`}>
          {btnLabel}
        </button>
      </div>
    </Card>
  );
}

export default function PoolPage() {
  const [depositAmt,  setDepositAmt]  = useState('');
  const [withdrawAmt, setWithdrawAmt] = useState('');
  const pool = usePoolStats();

  const tvl      = pool ? useFmt(pool.totalUsdc)  : '—';
  const fees     = pool ? useFmt(pool.feesEarned) : '—';
  const apr      = pool ? `${pool.apr7d.toFixed(1)}%` : '—';
  const shareP   = pool ? `$${pool.sharePrice.toFixed(4)}` : '—';
  const totalSh  = pool && pool.sharePrice > 0 ? (pool.totalUsdc / pool.sharePrice).toFixed(2) : '—';

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
            { label: 'Pool TVL',         value: tvl,        cls: 'text-tx-text'  },
            { label: 'Accumulated Fees', value: fees,       cls: 'text-tx-text'  },
            { label: 'APR 7d',           value: apr,        cls: 'text-tx-green' },
            { label: 'Your Share',       value: '0.00%',    cls: 'text-tx-text'  },
          ].map(({ label, value, cls }) => (
            <div key={label} className="bg-tx-surface px-4 py-3">
              <p className="text-[9px] font-mono uppercase tracking-[0.12em] text-tx-dim mb-1">{label}</p>
              <p className={`text-[18px] font-mono font-bold tabular-nums ${cls}`}>{value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-3 items-start">

          {/* Left */}
          <div className="space-y-3">

            <Card title="Your LP Position">
              <div className="flex items-center justify-center py-5">
                <p className="text-[11px] font-mono text-tx-dim text-center leading-relaxed">
                  No LP position yet.<br />Deposit USDC to start earning fees.
                </p>
              </div>
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
                { name: 'Trading Fees',  desc: '50% of open & close fees'       },
                { name: 'Funding Fees',  desc: '70% of majority-side funding'    },
                { name: 'Liquidations', desc: '44% of liquidated collateral'     },
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
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-tx-green">Long</span>
                  <span className="text-[14px] font-mono font-bold text-tx-green tabular-nums">—</span>
                </div>
                <div className="h-1.5 bg-tx-bg border border-tx-border overflow-hidden">
                  <div className="h-full bg-tx-green" style={{ width: '50%' }} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-tx-red">Short</span>
                  <span className="text-[14px] font-mono font-bold text-tx-red tabular-nums">—</span>
                </div>
              </div>
            </Card>

            <Card title="Protocol Vaults">
              <StatRow label="LP Vault"       value={tvl} />
              <StatRow label="Fee Vault"      value={fees} />
              <StatRow label="Insurance Fund" value="—" />
            </Card>
          </div>

          {/* Right */}
          <div className="space-y-3">

            <Card title="Wallet">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono text-tx-muted">USDC Balance</span>
                <span className="text-[11px] font-mono font-bold text-tx-text tabular-nums">$0.00</span>
              </div>
            </Card>

            <InputCard
              title="Deposit"
              label="Amount (USDC)"
              sublabel="Balance: $0.00"
              placeholder="0.00"
              btnLabel="DEPOSIT TO POOL"
              btnClass="bg-tx-green text-tx-bg hover:bg-[#00e87a]"
              value={depositAmt}
              onChange={setDepositAmt}
            />

            <InputCard
              title="Withdraw"
              label="Shares to Redeem"
              sublabel="Your shares: 0.00"
              placeholder="0.00"
              btnLabel="WITHDRAW FROM POOL"
              btnClass="bg-tx-bg border border-tx-border text-tx-muted hover:border-tx-border2"
              value={withdrawAmt}
              onChange={setWithdrawAmt}
            />

            <Card title="Claim Fees">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-mono text-tx-muted">Claimable</span>
                <span className="text-[11px] font-mono font-bold text-tx-text tabular-nums">$0.00</span>
              </div>
              <button className="w-full py-2.5 rounded-sm text-[11px] font-mono font-bold uppercase tracking-wider border border-tx-green text-tx-green hover:bg-tx-green/10 transition-all active:scale-[0.99]">
                Claim Fees
              </button>
            </Card>

          </div>
        </div>
      </div>
    </main>
  );
}
