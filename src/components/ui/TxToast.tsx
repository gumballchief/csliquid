'use client';

import { useToastStore, type TxToast } from '@/store/toastStore';
import { explorerTxUrl } from '@/lib/config';

export default function TxToastContainer() {
  const toasts     = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => removeToast(t.id)} />
      ))}
    </div>
  );
}

function ToastItem({ toast: t, onDismiss }: { toast: TxToast; onDismiss: () => void }) {
  const isOpen   = t.action === 'open';
  const sideTag  = t.side ? ` ${t.side.toUpperCase()}` : '';
  const label    = isOpen ? `Position opened${sideTag}` : 'Position closed';
  const skinShort = t.skinName.includes(' | ')
    ? t.skinName.split(' | ')[1]
    : t.skinName;
  const sigShort  = `${t.txSig.slice(0, 6)}…${t.txSig.slice(-4)}`;

  return (
    <div
      className="pointer-events-auto flex items-start gap-3 w-80 bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 shadow-2xl shadow-black/60 animate-in slide-in-from-bottom-2 fade-in duration-200"
      style={{ animation: 'slideInFromBottom 0.2s ease-out' }}
    >
      {/* Icon */}
      <div className={`mt-0.5 flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
        isOpen ? 'bg-green-900/60' : 'bg-blue-900/60'
      }`}>
        {isOpen ? (
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M2 7l3 3 6-6" stroke="#4ade80" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <circle cx="6.5" cy="6.5" r="4.5" stroke="#60a5fa" strokeWidth="1.8"/>
            <path d="M6.5 4v3l2 1" stroke="#60a5fa" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-semibold ${isOpen ? 'text-green-400' : 'text-blue-400'}`}>
          {label}
        </p>
        <p className="text-[11px] text-gray-400 truncate mt-0.5">{skinShort}</p>
        <a
          href={explorerTxUrl(t.txSig)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 mt-1.5 text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors font-mono"
        >
          {sigShort}
          <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
            <path d="M1.5 7.5l6-6M7.5 7.5V1.5H1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
        </a>
      </div>

      {/* Dismiss */}
      <button
        onClick={onDismiss}
        className="flex-shrink-0 text-gray-600 hover:text-gray-400 transition-colors p-0.5 mt-0.5"
        aria-label="Dismiss"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
          <path d="M9 1L1 9M1 1l8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
      </button>
    </div>
  );
}
