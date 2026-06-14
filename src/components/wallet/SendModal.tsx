'use client';

import { useState, useEffect } from 'react';
import { Keypair, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { useConnection } from '@solana/wallet-adapter-react';
import { decodeBase58 } from '@/lib/base58';

interface Props {
  address: string;
  onClose: () => void;
}

export default function SendModal({ address, onClose }: Props) {
  const { connection }  = useConnection();

  const [token,      setToken]     = useState<'SOL' | 'USDC'>('SOL');
  const [recipient,  setRecipient] = useState('');
  const [amount,     setAmount]    = useState('');
  const [balance,    setBalance]   = useState<number | null>(null);
  const [status,     setStatus]    = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [errorMsg,   setErrorMsg]  = useState('');
  const [txSig,      setTxSig]     = useState('');

  useEffect(() => {
    async function fetch() {
      try {
        const lamports = await connection.getBalance(new PublicKey(address));
        setBalance(lamports / LAMPORTS_PER_SOL);
      } catch { setBalance(null); }
    }
    fetch();
  }, [address, connection]);

  async function handleSend() {
    setErrorMsg('');
    if (!recipient.trim()) { setErrorMsg('Recipient address is required.'); return; }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) { setErrorMsg('Enter a valid amount.'); return; }

    let toPublicKey: PublicKey;
    try { toPublicKey = new PublicKey(recipient.trim()); }
    catch { setErrorMsg('Invalid Solana address.'); return; }

    if (token === 'SOL' && balance !== null && amt > balance - 0.001) {
      setErrorMsg('Insufficient balance (reserve 0.001 SOL for fees).');
      return;
    }

    const raw = localStorage.getItem('guest_keypair');
    if (!raw) { setErrorMsg('Keypair not found. Please re-login.'); return; }

    setStatus('pending');
    try {
      const senderKp   = Keypair.fromSecretKey(decodeBase58(raw));
      const { blockhash } = await connection.getLatestBlockhash();

      const tx = new Transaction({ recentBlockhash: blockhash, feePayer: senderKp.publicKey })
        .add(SystemProgram.transfer({
          fromPubkey: senderKp.publicKey,
          toPubkey:   toPublicKey,
          lamports:   Math.round(amt * LAMPORTS_PER_SOL),
        }));

      tx.sign(senderKp);
      const sig = await connection.sendRawTransaction(tx.serialize());
      await connection.confirmTransaction(sig, 'confirmed');

      setTxSig(sig);
      setStatus('success');
      const newBal = await connection.getBalance(senderKp.publicKey);
      setBalance(newBal / LAMPORTS_PER_SOL);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Transaction failed.');
      setStatus('error');
    }
  }

  function reset() {
    setRecipient('');
    setAmount('');
    setStatus('idle');
    setErrorMsg('');
    setTxSig('');
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center md:p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />

      <div
        className="relative w-full md:max-w-sm overflow-y-auto max-h-[100dvh] md:max-h-[90vh]"
        style={{ background: '#111214', border: '1px solid #1e2025', borderRadius: 4 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e2025]">
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#6b7280]">
            Send / Withdraw
          </span>
          <button
            onClick={onClose}
            className="font-mono text-[#6b7280] hover:text-[#e8eaed] transition-colors leading-none"
          >
            ✕
          </button>
        </div>

        <div className="p-4 space-y-3">
          {status === 'success' ? (
            <div className="text-center py-4 space-y-3">
              <p className="font-mono text-[12px] uppercase tracking-[0.1em] text-[#00ff88]">Sent</p>
              <p className="font-mono text-[10px] text-[#6b7280] break-all">{txSig}</p>
              <div className="flex gap-2">
                <button
                  onClick={reset}
                  className="flex-1 py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-[#6b7280] hover:text-[#e8eaed] transition-colors border border-[#1e2025]"
                  style={{ borderRadius: 3 }}
                >
                  Send again
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-[#e8eaed] hover:text-white transition-colors"
                  style={{ background: '#1e2025', borderRadius: 3 }}
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Token tabs */}
              <div
                className="flex gap-1 p-1"
                style={{ background: '#0a0b0d', borderRadius: 3 }}
              >
                {(['SOL', 'USDC'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setToken(t)}
                    disabled={t === 'USDC'}
                    className={`flex-1 py-1 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors ${
                      token === t ? 'text-[#e8eaed]' : 'text-[#6b7280] hover:text-[#9ca3af]'
                    } ${t === 'USDC' ? 'opacity-40 cursor-not-allowed' : ''}`}
                    style={token === t ? { background: '#1e2025', borderRadius: 3 } : { borderRadius: 3 }}
                    title={t === 'USDC' ? 'Coming soon' : undefined}
                  >
                    {t}{t === 'USDC' ? ' (soon)' : ''}
                  </button>
                ))}
              </div>

              {/* Balance */}
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#6b7280]">Balance</span>
                <span className="font-mono text-[11px] text-[#e8eaed] tabular-nums">
                  {balance === null ? '—' : `${balance.toFixed(4)} SOL`}
                </span>
              </div>

              {/* Recipient */}
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-[0.08em] text-[#6b7280] mb-1.5">
                  Recipient Address
                </label>
                <input
                  type="text"
                  value={recipient}
                  onChange={e => setRecipient(e.target.value)}
                  placeholder="Solana public key"
                  className="w-full px-3 py-2 font-mono text-[12px] text-[#e8eaed] placeholder-[#374151] focus:outline-none focus:border-[#3a3d45] transition-colors"
                  style={{ background: '#0a0b0d', border: '1px solid #2a2d35', borderRadius: 3 }}
                />
              </div>

              {/* Amount */}
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-[0.08em] text-[#6b7280] mb-1.5">
                  Amount (SOL)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 pr-14 font-mono text-[12px] text-[#e8eaed] placeholder-[#374151] focus:outline-none focus:border-[#3a3d45] transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    style={{ background: '#0a0b0d', border: '1px solid #2a2d35', borderRadius: 3 }}
                  />
                  {balance !== null && (
                    <button
                      type="button"
                      onClick={() => setAmount(Math.max(0, balance - 0.001).toFixed(4))}
                      className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[10px] uppercase tracking-[0.06em] text-[#00ff88] hover:text-[#00e87a] transition-colors px-1.5 py-0.5"
                      style={{ background: '#1e2025', borderRadius: 2 }}
                    >
                      MAX
                    </button>
                  )}
                </div>
              </div>

              {errorMsg && (
                <p
                  className="font-mono text-[10px] text-[#ff4444] px-3 py-2"
                  style={{ background: '#1a0000', border: '1px solid #3a0000', borderRadius: 3 }}
                >
                  {errorMsg}
                </p>
              )}

              <button
                onClick={handleSend}
                disabled={status === 'pending'}
                className="w-full py-2.5 font-mono text-[12px] font-bold uppercase tracking-[0.1em] text-[#0a0b0d] hover:bg-[#00e87a] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                style={{ background: '#00ff88', borderRadius: 3 }}
              >
                {status === 'pending' ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Sending…
                  </span>
                ) : 'Send SOL'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
