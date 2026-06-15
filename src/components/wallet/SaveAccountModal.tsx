'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { decodeBase58 } from '@/lib/base58';

export default function SaveAccountModal({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);

  const address = user?.type === 'generated' ? user.address : null;

  function getSecretKey(): Uint8Array | null {
    try {
      const b58 = localStorage.getItem('guest_keypair');
      if (!b58) return null;
      return decodeBase58(b58);
    } catch {
      return null;
    }
  }

  function downloadKeypair() {
    const sk = getSecretKey();
    if (!sk) return;
    const arr = Array.from(sk);
    const json = JSON.stringify(arr);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'csliquid-wallet.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  function copyPrivateKey() {
    try {
      const b58 = localStorage.getItem('guest_keypair');
      if (!b58) return;
      navigator.clipboard.writeText(b58);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center md:p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />

      <div
        className="relative w-full md:max-w-sm overflow-y-auto max-h-[100dvh] md:max-h-[90vh]"
        style={{ background: '#111214', border: '1px solid #1e2025', borderRadius: '4px 4px 0 0' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e2025]">
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#6b7280]">
            Save Account
          </span>
          <button
            onClick={onClose}
            className="font-mono text-[#6b7280] hover:text-[#e8eaed] transition-colors leading-none"
          >
            ✕
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Warning */}
          <div className="bg-[#ff4444]/10 border border-[#ff4444]/30 rounded-sm px-3 py-2.5">
            <p className="font-mono text-[10px] text-[#ff4444] uppercase tracking-[0.1em] font-bold mb-1">
              ⚠ Warning
            </p>
            <p className="font-mono text-[10px] text-[#ff8888] leading-relaxed">
              This is your only way to recover this account. Save your keypair before clearing browser data.
            </p>
          </div>

          {/* Public key */}
          {address && (
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#6b7280] mb-1.5">
                Public Key
              </p>
              <div
                className="font-mono text-[10px] text-[#e8eaed] break-all leading-relaxed px-3 py-2 rounded-sm"
                style={{ background: '#0a0b0d', border: '1px solid #1e2025' }}
              >
                {address}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-2">
            <button
              onClick={downloadKeypair}
              className="w-full py-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-[#0a0b0d] hover:bg-[#00e87a] active:scale-[0.99] transition-all"
              style={{ background: '#00ff88', borderRadius: 3 }}
            >
              ↓ Download Keypair (JSON)
            </button>

            <button
              onClick={copyPrivateKey}
              className="w-full py-2.5 font-mono text-[11px] uppercase tracking-[0.08em] transition-all active:scale-[0.99]"
              style={{ background: '#1e2025', borderRadius: 3, color: copied ? '#00ff88' : '#9ca3af', border: '1px solid #2a2d35' }}
            >
              {copied ? '✓ Copied!' : 'Copy Private Key (base58)'}
            </button>
          </div>

          <p className="font-mono text-[9px] text-[#374151] leading-relaxed text-center">
            Importing the JSON file into Phantom or Solflare restores full access.
          </p>
        </div>
      </div>
    </div>
  );
}
