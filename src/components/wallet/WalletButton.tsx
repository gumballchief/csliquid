'use client';

import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import ExportKeyModal   from './ExportKeyModal';
import SaveAccountModal from './SaveAccountModal';
import SendModal        from './SendModal';
import SwapModal        from './SwapModal';

const DEVNET_USDC = new PublicKey('Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr');

function truncate(addr: string) {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

const DROPDOWN_STYLE = {
  background: '#111214',
  border: '1px solid #1e2025',
} as const;

const TRIGGER_STYLE = {
  background: '#111214',
  border: '1px solid #1e2025',
  borderRadius: 3,
} as const;

const COPY_BTN_STYLE = {
  background: '#1e2025',
  borderRadius: 3,
} as const;

// Responsive panel: bottom sheet on mobile, dropdown on desktop
function Panel({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <>
      {/* Mobile overlay */}
      <div
        className="md:hidden fixed inset-0 bg-black/60 z-[59]"
        onClick={onClose}
      />
      {/* Panel: bottom-sheet on mobile, dropdown on desktop */}
      <div
        className="fixed inset-x-0 bottom-0 z-[60] overflow-hidden md:absolute md:inset-x-auto md:bottom-auto md:right-0 md:top-full md:mt-1 md:w-64"
        style={{
          ...DROPDOWN_STYLE,
          borderRadius: '4px 4px 0 0',
        }}
      >
        {/* Mobile drag indicator */}
        <div className="md:hidden flex justify-center pt-2.5 pb-1">
          <div className="w-8 h-1 rounded-full" style={{ background: '#374151' }} />
        </div>
        {children}
      </div>
    </>
  );
}

export default function WalletButton() {
  const { connected, publicKey, disconnect } = useWallet();
  const { setVisible }  = useWalletModal();
  const { connection }  = useConnection();
  const { user, isAuthenticated, loginWithWallet, logout } = useAuth();

  const [open,        setOpen]        = useState(false);
  const [balance,     setBalance]     = useState<number | null | 'loading'>('loading');
  const [usdcBalance, setUsdcBalance] = useState<number | null | 'loading'>('loading');
  const [copied,      setCopied]      = useState(false);
  const [showExport,  setShowExport]  = useState(false);
  const [showSave,    setShowSave]    = useState(false);
  const [showSend,    setShowSend]    = useState(false);
  const [showSwap,    setShowSwap]    = useState(false);
  const [mounted,     setMounted]     = useState(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setMounted(true); }, []);

  const menuRef      = useRef<HTMLDivElement>(null);
  const loggingOutRef = useRef(false);

  useEffect(() => {
    if (loggingOutRef.current) return;
    // Don't overwrite an existing session wallet (generated or email) when Phantom auto-connects.
    // Also check localStorage directly to catch the race condition where the keypair exists
    // but AuthContext hasn't hydrated the user state yet.
    const hasSessionWallet = user?.type === 'generated' || user?.type === 'email' || user?.type === 'wallet';
    if (connected && publicKey && !hasSessionWallet) {
      try {
        const hasGuestKeypair = !!localStorage.getItem('guest_keypair');
        if (!hasGuestKeypair) {
          loginWithWallet(publicKey.toBase58());
        }
      } catch {
        // localStorage unavailable — don't overwrite a potentially valid session
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, publicKey, loginWithWallet, user?.type]);

  const fetchBalances = useCallback(async (address: string) => {
    setBalance('loading');
    setUsdcBalance('loading');
    const pk = new PublicKey(address);
    console.log('[WalletButton] fetching balances for', address, 'on', connection.rpcEndpoint);

    const [solResult, tokenResult] = await Promise.allSettled([
      connection.getBalance(pk),
      connection.getParsedTokenAccountsByOwner(pk, { mint: DEVNET_USDC }),
    ]);

    if (solResult.status === 'fulfilled') {
      console.log('[WalletButton] SOL lamports:', solResult.value);
      setBalance(solResult.value / LAMPORTS_PER_SOL);
    } else {
      console.error('[WalletButton] SOL fetch failed:', solResult.reason);
      setBalance(null);
    }

    if (tokenResult.status === 'fulfilled') {
      const accts = tokenResult.value.value;
      const amt = accts.length > 0
        ? (accts[0].account.data.parsed.info.tokenAmount.uiAmount as number) ?? 0
        : 0;
      console.log('[WalletButton] USDC balance:', amt);
      setUsdcBalance(amt);
    } else {
      console.error('[WalletButton] USDC fetch failed:', tokenResult.reason);
      setUsdcBalance(null);
    }
  }, [connection]);

  // Derive the active address once so both effects share it
  const activeAddress = connected && publicKey
    ? publicKey.toBase58()
    : (user?.type === 'generated' || user?.type === 'email') ? user.address : null;

  useEffect(() => {
    if (!activeAddress) return;
    fetchBalances(activeAddress);
    const timer = setInterval(() => fetchBalances(activeAddress), 30_000);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAddress]);

  useEffect(() => {
    if (!open || !activeAddress) return;
    fetchBalances(activeAddress);
  }, [open, activeAddress, fetchBalances]);

  // Close on outside click (desktop only — mobile uses overlay)
  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [open]);

  // Prevent body scroll when open on mobile
  useEffect(() => {
    if (open && window.innerWidth < 768) {
      document.body.style.overflow = 'hidden';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleLogout() {
    loggingOutRef.current = true;
    setOpen(false);
    logout();
    if (connected) disconnect();
    window.location.href = '/';
  }

  const solFmt  = (v: number | null | 'loading', decimals = 4) =>
    v === 'loading' ? '…' : v === null ? '—' : v.toFixed(decimals);
  const balanceDisplay = `${solFmt(balance)} SOL`;
  const usdcDisplay    = `${solFmt(usdcBalance, 2)} USDC`;

  // ── Before hydration — return same markup as SSR to avoid 418/423/425 ────────
  if (!mounted) {
    return (
      <button
        onClick={() => setVisible(true)}
        className="px-4 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-[#0a0b0d] hover:bg-[#00e87a] transition-colors active:scale-[0.98]"
        style={{ background: '#00ff88', borderRadius: 3 }}
      >
        Connect Wallet
      </button>
    );
  }

  // ── Extension / hardware wallet ─────────────────────────────────────────────
  if (connected && publicKey) {
    const address = publicKey.toBase58();
    return (
      <>
        <div ref={menuRef} className="relative">
          <button
            onClick={() => setOpen(o => !o)}
            className="flex items-center gap-2 px-3 py-1.5 font-mono text-[11px] text-[#e8eaed] hover:border-[#2a2d35] transition-colors"
            style={TRIGGER_STYLE}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88] shrink-0" />
            <span className="tabular-nums">{truncate(address)}</span>
            <span className="hidden sm:inline text-[10px] text-[#6b7280] tabular-nums border-l border-[#2a2d35] pl-2">{solFmt(balance, 3)} SOL</span>
            <Chevron open={open} />
          </button>

          {open && (
            <Panel onClose={() => setOpen(false)}>
              <div className="px-4 py-3 border-b border-[#1e2025]">
                <div className="flex items-start justify-between gap-3">
                  <span className="font-mono text-[11px] text-[#e8eaed] break-all leading-relaxed">{address}</span>
                  <button
                    onClick={() => copyToClipboard(address)}
                    className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-[#6b7280] hover:text-[#e8eaed] transition-colors px-2 py-1 whitespace-nowrap"
                    style={COPY_BTN_STYLE}
                  >
                    {copied ? '✓ OK' : 'COPY'}
                  </button>
                </div>
              </div>

              <div className="border-b border-[#1e2025]">
                <div className="px-4 py-2 flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#6b7280]">SOL</span>
                  <span className="font-mono text-[11px] text-white tabular-nums">{balanceDisplay}</span>
                </div>
                <div className="px-4 py-2 flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#6b7280]">USDC</span>
                  <span className="font-mono text-[11px] text-white tabular-nums">{usdcDisplay}</span>
                </div>
              </div>

              <div>
                <MenuItem onClick={() => { setOpen(false); setShowSwap(true); }}>Swap SOL → USDC</MenuItem>
                <MenuItem onClick={() => { setOpen(false); setShowSend(true); }}>Send / Withdraw</MenuItem>
              </div>

              <div className="border-t border-[#1e2025]">
                <button
                  onClick={handleLogout}
                  className="w-full text-left px-4 py-3 font-mono text-[12px] uppercase tracking-wider text-[#ff4444] hover:bg-[#1a1d23] transition-colors min-h-[44px]"
                >
                  → Disconnect &amp; Log Out
                </button>
              </div>
              {/* iOS safe-area padding */}
              <div className="md:hidden h-safe-bottom" style={{ height: 'env(safe-area-inset-bottom, 8px)' }} />
            </Panel>
          )}
        </div>

        {showSend && <SendModal address={address} onClose={() => setShowSend(false)} />}
        {showSwap && (
          <SwapModal
            address={address}
            solBalance={typeof balance === 'number' ? balance : 0}
            onClose={() => setShowSwap(false)}
            onSuccess={(newSol, newUsdc) => { setBalance(newSol); setUsdcBalance(newUsdc); }}
          />
        )}
      </>
    );
  }

  // ── Browser-generated guest wallet ──────────────────────────────────────────
  if (isAuthenticated && user?.type === 'generated') {
    const { address } = user;
    return (
      <>
        <div ref={menuRef} className="relative flex items-center gap-2">
          <button
            onClick={() => setShowSave(true)}
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-[#6b7280] hover:text-[#e8eaed] transition-colors"
            style={{ border: '1px solid #1e2025', borderRadius: 3 }}
          >
            SAVE ACCOUNT
          </button>
          <button
            className="hidden sm:flex items-center justify-center w-7 h-7 text-[#6b7280] hover:text-[#e8eaed] transition-colors"
            style={{ border: '1px solid #1e2025', borderRadius: 3 }}
            title="Notifications (coming soon)"
            aria-label="Notifications"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
            </svg>
          </button>

          <button
            onClick={() => setOpen(o => !o)}
            className="flex items-center gap-2 px-3 py-1.5 font-mono text-[11px] text-[#e8eaed] hover:border-[#2a2d35] transition-colors"
            style={TRIGGER_STYLE}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#6b7280] shrink-0" />
            <span className="tabular-nums">{truncate(address)}</span>
            <span className="hidden sm:inline text-[10px] text-[#6b7280] tabular-nums border-l border-[#2a2d35] pl-2">{solFmt(balance, 3)} SOL</span>
            <Chevron open={open} />
          </button>

          {open && (
            <Panel onClose={() => setOpen(false)}>
              <div className="px-4 py-3 border-b border-[#1e2025]">
                <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#374151] mb-2">Guest Wallet</p>
                <div className="flex items-start justify-between gap-3">
                  <span className="font-mono text-[11px] text-[#e8eaed] break-all leading-relaxed">{address}</span>
                  <button
                    onClick={() => copyToClipboard(address)}
                    className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-[#6b7280] hover:text-[#e8eaed] transition-colors px-2 py-1 whitespace-nowrap"
                    style={COPY_BTN_STYLE}
                  >
                    {copied ? '✓ OK' : 'COPY'}
                  </button>
                </div>
              </div>

              <div className="border-b border-[#1e2025]">
                <div className="px-4 py-2 flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#6b7280]">SOL</span>
                  <span className="font-mono text-[11px] text-white tabular-nums">{balanceDisplay}</span>
                </div>
                <div className="px-4 py-2 flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#6b7280]">USDC</span>
                  <span className="font-mono text-[11px] text-white tabular-nums">{usdcDisplay}</span>
                </div>
              </div>

              <div>
                <MenuItem onClick={() => { setOpen(false); setShowSwap(true); }}>Swap SOL → USDC</MenuItem>
                <MenuItem onClick={() => { setOpen(false); setShowSend(true); }}>Send / Withdraw</MenuItem>
                <MenuItem onClick={() => { setOpen(false); setShowExport(true); }}>Export Key</MenuItem>
                <MenuItem onClick={() => { setOpen(false); setShowSave(true); }}>Save Account</MenuItem>
              </div>

              <div className="border-t border-[#1e2025]">
                <button
                  onClick={handleLogout}
                  className="w-full text-left px-4 py-3 font-mono text-[12px] uppercase tracking-wider text-[#ff4444] hover:bg-[#1a1d23] transition-colors min-h-[44px]"
                >
                  → Disconnect
                </button>
              </div>
              <div className="md:hidden" style={{ height: 'env(safe-area-inset-bottom, 8px)' }} />
            </Panel>
          )}
        </div>

        {showExport && <ExportKeyModal onClose={() => setShowExport(false)} />}
        {showSave   && <SaveAccountModal onClose={() => setShowSave(false)} />}
        {showSend   && <SendModal address={address} onClose={() => setShowSend(false)} />}
        {showSwap   && (
          <SwapModal
            address={address}
            solBalance={typeof balance === 'number' ? balance : 0}
            onClose={() => setShowSwap(false)}
            onSuccess={(newSol, newUsdc) => { setBalance(newSol); setUsdcBalance(newUsdc); }}
          />
        )}
      </>
    );
  }

  // ── Email user ──────────────────────────────────────────────────────────────
  if (isAuthenticated && user?.type === 'email') {
    return (
      <div ref={menuRef} className="relative">
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-2 px-3 py-1.5 font-mono text-[11px] text-[#e8eaed] hover:border-[#2a2d35] transition-colors"
          style={TRIGGER_STYLE}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[#6b7280] shrink-0" />
          <span className="truncate max-w-[120px]">{user.email}</span>
          <Chevron open={open} />
        </button>

        {open && (
          <Panel onClose={() => setOpen(false)}>
            <div className="px-4 py-3 border-b border-[#1e2025]">
              <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#374151] mb-1">Signed in as</p>
              <p className="font-mono text-[11px] text-[#e8eaed] break-all">{user.email}</p>
            </div>
            <div>
              <MenuItem onClick={() => { setOpen(false); setVisible(true); }}>Connect Wallet</MenuItem>
            </div>
            <div className="border-t border-[#1e2025]">
              <button
                onClick={handleLogout}
                className="w-full text-left px-4 py-3 font-mono text-[12px] uppercase tracking-wider text-[#ff4444] hover:bg-[#1a1d23] transition-colors min-h-[44px]"
              >
                → Log Out
              </button>
            </div>
            <div className="md:hidden" style={{ height: 'env(safe-area-inset-bottom, 8px)' }} />
          </Panel>
        )}
      </div>
    );
  }

  // ── Legacy guest (no keypair) ───────────────────────────────────────────────
  if (isAuthenticated && user?.type === 'guest') {
    return (
      <div ref={menuRef} className="relative">
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-2 px-3 py-1.5 font-mono text-[11px] text-[#6b7280] hover:border-[#2a2d35] transition-colors"
          style={TRIGGER_STYLE}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[#374151] shrink-0" />
          <span>Guest</span>
          <Chevron open={open} />
        </button>

        {open && (
          <Panel onClose={() => setOpen(false)}>
            <div>
              <MenuItem onClick={() => { setOpen(false); setVisible(true); }}>Connect Wallet</MenuItem>
            </div>
            <div className="border-t border-[#1e2025]">
              <button
                onClick={handleLogout}
                className="w-full text-left px-4 py-3 font-mono text-[12px] uppercase tracking-wider text-[#ff4444] hover:bg-[#1a1d23] transition-colors min-h-[44px]"
              >
                → Log Out
              </button>
            </div>
            <div className="md:hidden" style={{ height: 'env(safe-area-inset-bottom, 8px)' }} />
          </Panel>
        )}
      </div>
    );
  }

  // ── Not authenticated ───────────────────────────────────────────────────────
  return (
    <button
      onClick={() => setVisible(true)}
      className="px-4 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-[#0a0b0d] hover:bg-[#00e87a] transition-colors active:scale-[0.98]"
      style={{ background: '#00ff88', borderRadius: 3 }}
    >
      Connect Wallet
    </button>
  );
}

function MenuItem({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-4 py-3 font-mono text-[12px] text-[#e8eaed] hover:bg-[#1a1d23] transition-colors min-h-[44px]"
    >
      → {children}
    </button>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-3 h-3 text-[#374151] transition-transform duration-150 shrink-0 ${open ? 'rotate-180' : ''}`}
      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" />
    </svg>
  );
}
