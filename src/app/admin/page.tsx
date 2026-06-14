'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useRouter } from 'next/navigation';

const ADMIN_ADDRESS = 'EFm418GYQM4qxeqH5CLbndGGC2NYXtMozZtDPs6veHne';

// ── Mock on-chain state ──────────────────────────────────────────────────────
const INITIAL_STATE = {
  feeVaultBalance:     12847.50,
  insuranceFundBalance: 5219.33,
  totalFeesAllTime:    48291.82,
  openPositions:       12,
  totalVolume:         9_820_000,
  uniqueWallets:       47,
  protocolPaused:      false,
  oracle: [
    { market: 'AWP-INDEX',   price: 1842.50, updatedAt: Date.now() - 32_000  },
    { market: 'KNIFE-INDEX', price:  980.00, updatedAt: Date.now() - 45_000  },
    { market: 'AK47-INDEX',  price:  320.75, updatedAt: Date.now() - 38_000  },
    { market: 'GLOVE-INDEX', price:  610.20, updatedAt: Date.now() - 41_000  },
    { market: 'CS500',       price: 2840.00, updatedAt: Date.now() - 55_000  },
  ],
  competitionEndsAt: '2025-07-01',
};

// ── Small helpers ────────────────────────────────────────────────────────────
function ago(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function fmt(n: number, decimals = 2): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtVol(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n}`;
}

// ── Toast ────────────────────────────────────────────────────────────────────
function useToast() {
  const [toasts, setToasts] = useState<{ id: number; msg: string; ok: boolean }[]>([]);
  const push = useCallback((msg: string, ok = true) => {
    const id = Date.now();
    setToasts(t => [...t, { id, msg, ok }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  }, []);
  return { toasts, push };
}

function ToastStack({ toasts }: { toasts: { id: number; msg: string; ok: boolean }[] }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`px-4 py-2.5 font-mono text-[11px] border rounded-sm shadow-lg pointer-events-auto ${
            t.ok
              ? 'bg-tx-surface border-tx-green/40 text-tx-green'
              : 'bg-tx-surface border-tx-red/40 text-tx-red'
          }`}
        >
          {t.msg}
        </div>
      ))}
    </div>
  );
}

// ── Section wrapper ──────────────────────────────────────────────────────────
function Section({ title, badge, children }: {
  title: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-tx-surface border border-tx-border rounded overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-tx-border">
        <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-tx-green">{title}</h2>
        {badge && (
          <span className="font-mono text-[8px] uppercase px-2 py-0.5 bg-tx-raised border border-tx-border text-tx-dim">
            {badge}
          </span>
        )}
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </section>
  );
}

// ── Stat cell (gap-px grid child) ────────────────────────────────────────────
function Stat({ label, value, sub, valueClass = 'text-tx-text' }: {
  label: string; value: string; sub?: string; valueClass?: string;
}) {
  return (
    <div className="bg-tx-surface px-4 py-3">
      <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-tx-dim mb-1">{label}</p>
      <p className={`font-mono text-[16px] font-bold tabular-nums ${valueClass}`}>{value}</p>
      {sub && <p className="font-mono text-[9px] text-tx-dim mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Input ────────────────────────────────────────────────────────────────────
function Input({
  value, onChange, placeholder, className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      spellCheck={false}
      autoComplete="off"
      className={`bg-tx-bg border border-tx-border rounded-sm px-3 py-2 font-mono text-[11px] text-tx-text placeholder-tx-dim focus:outline-none focus:border-tx-border2 transition-colors ${className}`}
    />
  );
}

// ── Action button ────────────────────────────────────────────────────────────
function Btn({
  onClick, disabled, children, variant = 'green', className = '',
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  variant?: 'green' | 'red' | 'muted' | 'outline';
  className?: string;
}) {
  const base = 'px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-wider rounded-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]';
  const variants = {
    green:   'bg-tx-green text-tx-bg hover:bg-[#00e87a]',
    red:     'bg-tx-red/10 border border-tx-red/40 text-tx-red hover:bg-tx-red/20',
    muted:   'bg-tx-raised border border-tx-border text-tx-muted hover:text-tx-text hover:border-tx-border2',
    outline: 'border border-tx-border text-tx-dim hover:text-tx-text hover:border-tx-border2',
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const { publicKey, connected } = useWallet();
  const router = useRouter();
  const { toasts, push } = useToast();

  // Client-side defense-in-depth: redirect if wrong/no wallet
  useEffect(() => {
    if (!connected) return;
    if (publicKey?.toBase58() !== ADMIN_ADDRESS) {
      router.replace('/');
    }
  }, [connected, publicKey, router]);

  // ── State ──────────────────────────────────────────────────────────────────
  const [state, setState] = useState(INITIAL_STATE);
  const [now, setNow] = useState(Date.now());

  // Tick "ago" timers every second
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Revenue
  const [withdrawDest, setWithdrawDest] = useState('');
  const [withdrawing,  setWithdrawing]  = useState<'fees' | 'insurance' | null>(null);

  // Protocol
  const [toggling, setToggling] = useState(false);

  // Oracle overrides
  const [oracleInputs, setOracleInputs] = useState<Record<string, string>>(() =>
    Object.fromEntries(state.oracle.map(o => [o.market, String(o.price)]))
  );
  const [overriding, setOverriding] = useState<string | null>(null);
  const [forceUpdating, setForceUpdating] = useState(false);

  // Competition
  const [winnerWallet, setWinnerWallet] = useState('');
  const [prizeSkin,    setPrizeSkin]    = useState('');
  const [compEndDate,  setCompEndDate]  = useState(state.competitionEndsAt);
  const [settingWinner, setSettingWinner] = useState(false);
  const [updatingDate,  setUpdatingDate]  = useState(false);

  // ── Handlers ───────────────────────────────────────────────────────────────
  async function handleWithdraw(type: 'fees' | 'insurance') {
    setWithdrawing(type);
    await new Promise(r => setTimeout(r, 1200));
    const amount = type === 'fees' ? state.feeVaultBalance : state.insuranceFundBalance;
    setState(s => ({
      ...s,
      feeVaultBalance:     type === 'fees'      ? 0 : s.feeVaultBalance,
      insuranceFundBalance: type === 'insurance' ? 0 : s.insuranceFundBalance,
    }));
    push(`Withdrew $${fmt(amount)} USDC → ${withdrawDest || ADMIN_ADDRESS.slice(0, 8) + '…'}`, true);
    setWithdrawing(null);
  }

  async function handleTogglePause() {
    setToggling(true);
    await new Promise(r => setTimeout(r, 900));
    setState(s => ({ ...s, protocolPaused: !s.protocolPaused }));
    push(state.protocolPaused ? 'Protocol unpaused' : 'Protocol paused', true);
    setToggling(false);
  }

  async function handleOracleOverride(market: string) {
    const raw = oracleInputs[market];
    const price = parseFloat(raw);
    if (isNaN(price) || price <= 0) { push(`Invalid price for ${market}`, false); return; }
    setOverriding(market);
    await new Promise(r => setTimeout(r, 800));
    setState(s => ({
      ...s,
      oracle: s.oracle.map(o => o.market === market ? { ...o, price, updatedAt: Date.now() } : o),
    }));
    push(`${market} price overridden → $${fmt(price)}`, true);
    setOverriding(null);
  }

  async function handleForceUpdate() {
    setForceUpdating(true);
    await new Promise(r => setTimeout(r, 1500));
    setState(s => ({
      ...s,
      oracle: s.oracle.map(o => ({ ...o, updatedAt: Date.now() })),
    }));
    push('Oracle prices force-updated for all markets', true);
    setForceUpdating(false);
  }

  async function handleSetWinner() {
    if (!winnerWallet) { push('Winner wallet required', false); return; }
    if (!prizeSkin)    { push('Prize skin name required', false); return; }
    setSettingWinner(true);
    await new Promise(r => setTimeout(r, 1100));
    push(`Winner set: ${winnerWallet.slice(0, 8)}… → ${prizeSkin}`, true);
    setSettingWinner(false);
  }

  async function handleUpdateEndDate() {
    if (!compEndDate) { push('End date required', false); return; }
    setUpdatingDate(true);
    await new Promise(r => setTimeout(r, 700));
    setState(s => ({ ...s, competitionEndsAt: compEndDate }));
    push(`Competition end date updated → ${compEndDate}`, true);
    setUpdatingDate(false);
  }

  // Show loading state until wallet check resolves
  if (!connected || publicKey?.toBase58() !== ADMIN_ADDRESS) {
    return (
      <main className="min-h-screen bg-tx-bg flex items-center justify-center">
        <p className="font-mono text-[11px] text-tx-dim uppercase tracking-wider">Redirecting…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-tx-bg px-4 py-6 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[8px] uppercase tracking-[0.15em] px-2 py-0.5 bg-tx-green/10 border border-tx-green/20 text-tx-green">
                Admin
              </span>
              <span className="font-mono text-[8px] uppercase tracking-[0.15em] px-2 py-0.5 bg-tx-raised border border-tx-border text-tx-dim">
                Devnet
              </span>
            </div>
            <h1 className="font-mono text-2xl font-black text-tx-text tracking-tight">
              CS<span className="text-tx-green">LIQUID</span> Admin
            </h1>
            <p className="font-mono text-[10px] text-tx-dim">
              {ADMIN_ADDRESS.slice(0, 8)}…{ADMIN_ADDRESS.slice(-6)}
            </p>
          </div>
          <div className="text-right">
            <p className="font-mono text-[9px] text-tx-dim uppercase tracking-wider">Protocol Status</p>
            <p className={`font-mono text-[13px] font-bold mt-0.5 ${state.protocolPaused ? 'text-tx-red' : 'text-tx-green'}`}>
              {state.protocolPaused ? 'PAUSED' : 'ACTIVE'}
            </p>
          </div>
        </div>

        {/* ── REVENUE ──────────────────────────────────────────────────────── */}
        <Section title="Revenue" badge="Fee Vault">
          <div className="grid grid-cols-3 gap-px bg-tx-border rounded overflow-hidden">
            <Stat
              label="Fee Vault USDC"
              value={`$${fmt(state.feeVaultBalance)}`}
              valueClass="text-tx-green"
            />
            <Stat
              label="Insurance Fund"
              value={`$${fmt(state.insuranceFundBalance)}`}
              valueClass="text-tx-green"
            />
            <Stat
              label="Total Fees All Time"
              value={`$${fmt(state.totalFeesAllTime)}`}
              sub="cumulative"
            />
          </div>

          <div className="space-y-2">
            <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-tx-dim">
              Destination Wallet (leave blank to use admin wallet)
            </p>
            <Input
              value={withdrawDest}
              onChange={setWithdrawDest}
              placeholder={`${ADMIN_ADDRESS.slice(0, 12)}… (default)`}
              className="w-full"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Btn
              onClick={() => handleWithdraw('fees')}
              disabled={state.feeVaultBalance === 0 || withdrawing === 'fees'}
              variant="green"
            >
              {withdrawing === 'fees' ? 'Withdrawing…' : `Withdraw Fees ($${fmt(state.feeVaultBalance)})`}
            </Btn>
            <Btn
              onClick={() => handleWithdraw('insurance')}
              disabled={state.insuranceFundBalance === 0 || withdrawing === 'insurance'}
              variant="red"
            >
              {withdrawing === 'insurance' ? 'Withdrawing…' : `Withdraw Insurance ($${fmt(state.insuranceFundBalance)})`}
            </Btn>
          </div>
        </Section>

        {/* ── PROTOCOL ─────────────────────────────────────────────────────── */}
        <Section title="Protocol">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-tx-border rounded overflow-hidden">
            <Stat label="Open Positions"  value={String(state.openPositions)} />
            <Stat label="Total Volume"    value={fmtVol(state.totalVolume)} />
            <Stat label="Unique Wallets"  value={String(state.uniqueWallets)} />
            <Stat
              label="Protocol State"
              value={state.protocolPaused ? 'PAUSED' : 'ACTIVE'}
              valueClass={state.protocolPaused ? 'text-tx-red' : 'text-tx-green'}
            />
          </div>

          <div className="flex items-center gap-3">
            <Btn
              onClick={handleTogglePause}
              disabled={toggling}
              variant={state.protocolPaused ? 'green' : 'red'}
            >
              {toggling
                ? (state.protocolPaused ? 'Unpausing…' : 'Pausing…')
                : (state.protocolPaused ? 'Unpause Protocol' : 'Pause Protocol')}
            </Btn>
            <p className="font-mono text-[9px] text-tx-dim">
              {state.protocolPaused
                ? 'All trading is currently halted. Unpause to resume.'
                : 'Pausing will halt all new opens and prevents closes.'}
            </p>
          </div>
        </Section>

        {/* ── ORACLE ───────────────────────────────────────────────────────── */}
        <Section title="Oracle" badge="Price Feed">
          <div className="bg-tx-bg border border-tx-border rounded overflow-hidden">
            <div className="grid grid-cols-[1fr_120px_120px_100px_100px] gap-x-4 px-4 py-2 border-b border-tx-border">
              {['Market', 'Current Price', 'Override Price', 'Last Update', ''].map(h => (
                <span key={h} className="font-mono text-[9px] uppercase tracking-[0.1em] text-tx-dim">{h}</span>
              ))}
            </div>
            <div className="divide-y divide-tx-border/40">
              {state.oracle.map(o => {
                const secAgo = Math.floor((now - o.updatedAt) / 1000);
                const stale  = secAgo > 120;
                return (
                  <div
                    key={o.market}
                    className="grid grid-cols-[1fr_120px_120px_100px_100px] gap-x-4 px-4 py-2.5 items-center hover:bg-tx-raised transition-colors"
                  >
                    <span className="font-mono text-[11px] text-tx-text">{o.market}</span>
                    <span className="font-mono text-[11px] text-tx-green tabular-nums">${fmt(o.price)}</span>
                    <Input
                      value={oracleInputs[o.market] ?? ''}
                      onChange={v => setOracleInputs(x => ({ ...x, [o.market]: v }))}
                      placeholder={String(o.price)}
                      className="py-1.5 text-[10px]"
                    />
                    <span className={`font-mono text-[10px] tabular-nums ${stale ? 'text-yellow-400' : 'text-tx-dim'}`}>
                      {ago(o.updatedAt)}
                    </span>
                    <Btn
                      onClick={() => handleOracleOverride(o.market)}
                      disabled={overriding === o.market}
                      variant="muted"
                      className="py-1.5 text-[9px]"
                    >
                      {overriding === o.market ? '…' : 'Set'}
                    </Btn>
                  </div>
                );
              })}
            </div>
          </div>

          <Btn onClick={handleForceUpdate} disabled={forceUpdating} variant="outline">
            {forceUpdating ? 'Fetching Prices…' : 'Force Update All Markets'}
          </Btn>
        </Section>

        {/* ── COMPETITION ──────────────────────────────────────────────────── */}
        <Section title="Competition">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* End date */}
            <div className="space-y-2">
              <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-tx-dim">Competition End Date</p>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={compEndDate}
                  onChange={e => setCompEndDate(e.target.value)}
                  className="flex-1 bg-tx-bg border border-tx-border rounded-sm px-3 py-2 font-mono text-[11px] text-tx-text focus:outline-none focus:border-tx-border2 transition-colors"
                />
                <Btn onClick={handleUpdateEndDate} disabled={updatingDate} variant="muted">
                  {updatingDate ? 'Saving…' : 'Update'}
                </Btn>
              </div>
              <p className="font-mono text-[9px] text-tx-dim">
                Current end: <span className="text-tx-muted">{state.competitionEndsAt}</span>
              </p>
            </div>

            {/* Current stats */}
            <div className="bg-tx-bg border border-tx-border rounded p-3 space-y-1.5">
              <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-tx-dim mb-2">Competition Info</p>
              {[
                ['Status',       'Active'],
                ['Prize Pool',   '$5,000 USDC'],
                ['Participants', '47'],
                ['Days Remaining', (() => {
                  const d = Math.ceil((new Date(state.competitionEndsAt).getTime() - Date.now()) / 86_400_000);
                  return d > 0 ? `${d}d` : 'Ended';
                })()],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span className="font-mono text-[10px] text-tx-dim">{k}</span>
                  <span className="font-mono text-[10px] text-tx-muted">{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Winner */}
          <div className="space-y-3 pt-1 border-t border-tx-border">
            <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-tx-green">Set Competition Winner</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block font-mono text-[9px] uppercase tracking-[0.08em] text-tx-dim">
                  Winner Wallet Address
                </label>
                <Input
                  value={winnerWallet}
                  onChange={setWinnerWallet}
                  placeholder="Solana wallet address…"
                  className="w-full"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block font-mono text-[9px] uppercase tracking-[0.08em] text-tx-dim">
                  Prize Skin Name
                </label>
                <Input
                  value={prizeSkin}
                  onChange={setPrizeSkin}
                  placeholder="AWP Dragon Lore FN…"
                  className="w-full"
                />
              </div>
            </div>
            <Btn
              onClick={handleSetWinner}
              disabled={settingWinner || !winnerWallet || !prizeSkin}
              variant="green"
            >
              {settingWinner ? 'Setting Winner…' : 'Set Winner & Distribute Prize'}
            </Btn>
            <p className="font-mono text-[9px] text-tx-dim">
              This will call the <code className="text-tx-green bg-tx-raised px-1">set_competition_winner</code> instruction on-chain and mark the competition as ended.
            </p>
          </div>
        </Section>

        {/* Footer */}
        <div className="flex items-center justify-between py-2">
          <p className="font-mono text-[9px] text-tx-dim">
            Connected as{' '}
            <span className="text-tx-muted font-bold">
              {ADMIN_ADDRESS.slice(0, 8)}…{ADMIN_ADDRESS.slice(-6)}
            </span>
          </p>
          <p className="font-mono text-[9px] text-tx-dim">CSLIQUID Admin · Solana Devnet</p>
        </div>

      </div>

      <ToastStack toasts={toasts} />
    </main>
  );
}
