'use client';

import { useToastStore, type TxToast, type InfoToast } from '@/store/toastStore';

const SOLSCAN_BASE = 'https://solscan.io/tx/';
const CLUSTER      = '?cluster=devnet';

export default function TxToastContainer() {
  const toasts      = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);
  const infoToasts  = useToastStore((s) => s.infoToasts);
  const removeInfo  = useToastStore((s) => s.removeInfo);

  if (toasts.length === 0 && infoToasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-3 pointer-events-none">
      {infoToasts.map((t) => (
        <InfoToastItem key={t.id} toast={t} onDismiss={() => removeInfo(t.id)} />
      ))}
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => removeToast(t.id)} />
      ))}
    </div>
  );
}

function InfoToastItem({ toast: t, onDismiss }: { toast: InfoToast; onDismiss: () => void }) {
  const sigShort = t.txSig ? `${t.txSig.slice(0, 6)}…${t.txSig.slice(-4)}` : null;
  const txUrl    = t.txSig ? `${SOLSCAN_BASE}${t.txSig}${CLUSTER}` : null;

  return (
    <div
      className="pointer-events-auto w-72"
      style={{
        animation:    'toast-slide-in 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        background:   '#0d0d0d',
        borderRadius: '2px',
        borderLeft:   '3px solid #00ff88',
        borderTop:    '1px solid #1e2025',
        borderRight:  '1px solid #1e2025',
        borderBottom: '1px solid #1e2025',
        padding:      '10px 12px',
        boxShadow:    '0 8px 32px rgba(0,0,0,0.85)',
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0 space-y-1.5">
          <p className="font-mono text-[11px] text-white leading-snug">{t.message}</p>
          {txUrl && sigShort && (
            <a
              href={txUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 font-mono text-[10px] transition-colors"
              style={{ color: '#00994d' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#00ff88')}
              onMouseLeave={e => (e.currentTarget.style.color = '#00994d')}
            >
              TX {sigShort} ↗
            </a>
          )}
        </div>
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="shrink-0 mt-0.5 transition-colors"
          style={{ color: '#2a2a2a' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#555')}
          onMouseLeave={e => (e.currentTarget.style.color = '#2a2a2a')}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

function ToastItem({ toast: t, onDismiss }: { toast: TxToast; onDismiss: () => void }) {
  const isOpen = t.action === 'open';
  const isLong = t.side === 'long';

  const dirSymbol = isLong ? '▲' : '▼';
  const dirLabel  = t.side ? (isLong ? 'LONG' : 'SHORT') : null;
  const dirColor  = isLong ? '#00ff88' : '#ff4444';

  const market    = t.skinName.toUpperCase();
  const sigShort  = `${t.txSig.slice(0, 6)}…${t.txSig.slice(-4)}`;
  const txUrl     = `${SOLSCAN_BASE}${t.txSig}${CLUSTER}`;

  const midParts: string[] = [];
  if (t.leverage)   midParts.push(`${t.leverage}×`);
  if (t.notional)   midParts.push(`$${t.notional.toLocaleString(undefined, { maximumFractionDigits: 0 })} notional`);
  if (t.entryPrice) midParts.push(`entry $${t.entryPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  const midLine = midParts.join(' · ');

  return (
    <div
      className="pointer-events-auto w-72"
      style={{
        animation:    'toast-slide-in 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        background:   '#0d0d0d',
        borderRadius: '2px',
        borderLeft:   '3px solid #00ff88',
        borderTop:    '1px solid #1e2025',
        borderRight:  '1px solid #1e2025',
        borderBottom: '1px solid #1e2025',
        padding:      '10px 12px',
        boxShadow:    '0 8px 32px rgba(0,0,0,0.85), 0 0 0 1px rgba(0,255,136,0.04)',
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0 space-y-1.5">

          {/* Top line: direction badge + market */}
          <div className="flex items-center gap-1.5 min-w-0">
            {isOpen && dirLabel ? (
              <span className="font-mono text-[11px] font-bold shrink-0" style={{ color: dirColor }}>
                {dirSymbol} {dirLabel}
              </span>
            ) : (
              <span className="font-mono text-[11px] font-bold text-[#888] shrink-0">
                ✕ CLOSED
              </span>
            )}
            <span className="font-mono text-[10px] text-[#444]">·</span>
            <span className="font-mono text-[11px] text-white font-medium truncate">{market}</span>
          </div>

          {/* Middle line: leverage · notional · entry */}
          {midLine && (
            <p className="font-mono text-[10px] tabular-nums" style={{ color: '#555' }}>
              {midLine}
            </p>
          )}

          {/* Bottom line: TX hash link */}
          <a
            href={txUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 font-mono text-[10px] transition-colors"
            style={{ color: '#00994d' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#00ff88')}
            onMouseLeave={e => (e.currentTarget.style.color = '#00994d')}
          >
            TX {sigShort} ↗
          </a>
        </div>

        {/* Dismiss */}
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="shrink-0 mt-0.5 transition-colors"
          style={{ color: '#2a2a2a' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#555')}
          onMouseLeave={e => (e.currentTarget.style.color = '#2a2a2a')}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
