'use client';

import { useState } from 'react';

export default function ExportKeyModal({ onClose }: { onClose: () => void }) {
  const secretKeyB58 = typeof window !== 'undefined'
    ? (localStorage.getItem('guest_keypair') ?? '')
    : '';

  const [confirmed, setConfirmed] = useState(false);
  const [copied,    setCopied]    = useState(false);

  function copy() {
    navigator.clipboard.writeText(secretKeyB58);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center md:p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />

      <div
        className="relative w-full md:max-w-md overflow-y-auto max-h-[100dvh] md:max-h-[90vh]"
        style={{ background: '#111214', border: '1px solid #1e2025', borderRadius: '4px 4px 0 0' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e2025]">
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#6b7280]">
            Export Private Key
          </span>
          <button
            onClick={onClose}
            className="font-mono text-[#6b7280] hover:text-[#e8eaed] transition-colors leading-none"
          >
            ✕
          </button>
        </div>

        <div className="p-4 space-y-3">
          {/* Warning box */}
          <div
            className="px-3 py-3 space-y-1.5"
            style={{ background: '#1a1200', border: '1px solid #3a2800', borderRadius: 3 }}
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#f59e0b]">
              Never share your private key
            </p>
            <p className="font-mono text-[11px] leading-relaxed" style={{ color: 'rgba(245,158,11,0.8)' }}>
              Anyone with this key has full control of your wallet and all funds in it. Store it somewhere safe and offline.
            </p>
          </div>

          {/* Confirm checkbox */}
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={e => setConfirmed(e.target.checked)}
              className="mt-0.5 w-3.5 h-3.5 cursor-pointer shrink-0 appearance-none checked:bg-[#1e2025]"
              style={{ border: '1px solid #1e2025', borderRadius: 2, background: confirmed ? '#1e2025' : '#0a0b0d' }}
            />
            <span className="font-mono text-[11px] text-[#6b7280] leading-relaxed">
              I understand that CSLIQUID cannot recover this key. I am responsible for keeping it safe.
            </span>
          </label>

          {/* Key display */}
          {confirmed && (
            <div className="space-y-2">
              <div
                className="p-3"
                style={{ background: '#0a0b0d', border: '1px solid #2a2d35', borderRadius: 3 }}
              >
                <p
                  className="font-mono text-[11px] text-[#00ff88] leading-relaxed select-all"
                  style={{ wordBreak: 'break-all' }}
                >
                  {secretKeyB58}
                </p>
              </div>

              <button
                onClick={copy}
                className="w-full py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[#6b7280] hover:text-[#e8eaed] border border-[#1e2025] hover:border-[#2a2d35] transition-colors"
                style={{ borderRadius: 3 }}
              >
                {copied ? '✓ Copied' : 'Copy to Clipboard'}
              </button>

              <p className="font-mono text-[9px] text-[#374151] text-center leading-relaxed">
                Base58-encoded 64-byte secret key. Compatible with Phantom &quot;Import Private Key&quot;.
              </p>
            </div>
          )}

          <button
            onClick={onClose}
            className="w-full py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-[#e8eaed] hover:text-white transition-colors"
            style={{ background: '#1e2025', borderRadius: 3 }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
