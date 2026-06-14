'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Keypair, PublicKey, VersionedTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { decodeBase58 } from '@/lib/base58';

const SOL_MINT    = 'So11111111111111111111111111111111111111112';
const USDC_MINT   = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const SLIPPAGE_BPS  = 50;   // 0.5%
const FEE_RESERVE   = 0.001; // keep for tx fees

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QuoteResponse = Record<string, any>;

interface Props {
  address:    string;
  solBalance: number;
  onClose:    () => void;
  onSuccess?: (newSolBalance: number, newUsdcBalance: number) => void;
}

export default function SwapModal({ address, solBalance, onClose, onSuccess }: Props) {
  const { connection }                   = useConnection();
  const { signTransaction, connected }   = useWallet();

  const [solAmount,    setSolAmount]    = useState('');
  const [quote,        setQuote]        = useState<QuoteResponse | null>(null);
  const [quoting,      setQuoting]      = useState(false);
  const [quoteError,   setQuoteError]   = useState('');
  const [status,       setStatus]       = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [errorMsg,     setErrorMsg]     = useState('');
  const [txSig,        setTxSig]        = useState('');
  const [usdcReceived, setUsdcReceived] = useState(0);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const expectedUsdc  = quote ? Number(quote.outAmount) / 1_000_000 : 0;
  const priceImpact   = quote ? parseFloat(quote.priceImpactPct) * 100 : 0;
  const maxSol        = Math.max(0, solBalance - FEE_RESERVE);

  // ── Quote fetcher ────────────────────────────────────────────────────────
  const fetchQuote = useCallback(async (sol: number) => {
    if (sol <= 0) { setQuote(null); setQuoteError(''); return; }
    setQuoting(true);
    setQuoteError('');
    try {
      const lamports = Math.floor(sol * LAMPORTS_PER_SOL);
      const res = await fetch(
        `https://quote-api.jup.ag/v6/quote?inputMint=${SOL_MINT}&outputMint=${USDC_MINT}&amount=${lamports}&slippageBps=${SLIPPAGE_BPS}`,
      );
      if (!res.ok) throw new Error(`Quote failed (${res.status})`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setQuote(data);
    } catch (e) {
      setQuoteError(e instanceof Error ? e.message : 'Failed to fetch quote');
      setQuote(null);
    } finally {
      setQuoting(false);
    }
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    const val = parseFloat(solAmount);
    if (!solAmount || isNaN(val) || val <= 0) { setQuote(null); setQuoteError(''); return; }
    debounceRef.current = setTimeout(() => fetchQuote(val), 350);
    return () => clearTimeout(debounceRef.current);
  }, [solAmount, fetchQuote]);

  // ── USDC balance helper ──────────────────────────────────────────────────
  async function fetchUsdcBalance(pubkey: PublicKey): Promise<number> {
    try {
      const accounts = await connection.getParsedTokenAccountsByOwner(pubkey, {
        mint: new PublicKey(USDC_MINT),
      });
      if (!accounts.value.length) return 0;
      return accounts.value[0].account.data.parsed.info.tokenAmount.uiAmount ?? 0;
    } catch { return 0; }
  }

  // ── Swap handler ─────────────────────────────────────────────────────────
  async function handleSwap() {
    if (!quote) return;
    const sol = parseFloat(solAmount);
    if (isNaN(sol) || sol <= 0)           { setErrorMsg('Enter a valid SOL amount.'); return; }
    if (sol > solBalance - FEE_RESERVE)   { setErrorMsg(`Keep at least ${FEE_RESERVE} SOL for fees.`); return; }

    setStatus('pending');
    setErrorMsg('');

    try {
      // 1. Get swap transaction
      const swapRes = await fetch('https://quote-api.jup.ag/v6/swap', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteResponse:              quote,
          userPublicKey:              address,
          wrapAndUnwrapSol:           true,
          dynamicComputeUnitLimit:    true,
          prioritizationFeeLamports:  'auto',
        }),
      });
      if (!swapRes.ok) throw new Error(`Swap API error (${swapRes.status})`);
      const { swapTransaction } = await swapRes.json();

      // 2. Deserialize VersionedTransaction
      const tx = VersionedTransaction.deserialize(Buffer.from(swapTransaction, 'base64'));

      // 3. Sign — extension wallet or stored keypair
      let signedTx: VersionedTransaction;
      if (connected && signTransaction) {
        signedTx = await signTransaction(tx);
      } else {
        const raw = localStorage.getItem('guest_keypair');
        if (!raw) throw new Error('Keypair not found — please re-login.');
        const keypair = Keypair.fromSecretKey(decodeBase58(raw));
        tx.sign([keypair]);
        signedTx = tx;
      }

      // 4. Send + confirm
      const sig = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        maxRetries:    3,
      });
      await connection.confirmTransaction(sig, 'confirmed');
      setTxSig(sig);

      // 5. Refresh balances
      const pubkey = new PublicKey(address);
      const [newLamports, newUsdc] = await Promise.all([
        connection.getBalance(pubkey),
        fetchUsdcBalance(pubkey),
      ]);
      setUsdcReceived(expectedUsdc);
      setStatus('success');
      onSuccess?.(newLamports / LAMPORTS_PER_SOL, newUsdc);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Swap failed.');
      setStatus('error');
    }
  }

  function reset() {
    setSolAmount('');
    setQuote(null);
    setQuoteError('');
    setStatus('idle');
    setErrorMsg('');
    setTxSig('');
  }

  const canSwap = !!quote && !quoting && status !== 'pending' && parseFloat(solAmount) > 0;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center md:p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <div className="relative w-full md:max-w-sm overflow-y-auto max-h-[100dvh] md:max-h-[90vh]"
        style={{ background: '#111214', border: '1px solid #1e2025', borderRadius: '4px 4px 0 0' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e2025]">
          <h2 className="font-mono text-[12px] font-bold uppercase tracking-[0.12em] text-[#6b7280]">
            SWAP SOL → USDC
          </h2>
          <button
            onClick={onClose}
            className="text-[#374151] hover:text-[#6b7280] transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-3">

          {/* ── Success state ── */}
          {status === 'success' ? (
            <div className="text-center py-4 space-y-3">
              <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#00ff88]">
                Swap Successful
              </p>
              <p className="font-mono text-2xl font-black text-[#00ff88]">
                +{usdcReceived.toFixed(2)} USDC
              </p>
              <p className="font-mono text-[9px] text-[#374151] break-all">{txSig}</p>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={reset}
                  className="flex-1 py-2 font-mono text-[10px] uppercase tracking-wider text-[#6b7280] hover:text-[#e8eaed] transition-colors border border-[#1e2025] hover:border-[#2a2d35]"
                  style={{ borderRadius: 3 }}
                >
                  Swap again
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-[#0a0b0d] transition-colors"
                  style={{ background: '#00ff88', borderRadius: 3 }}
                >
                  Done
                </button>
              </div>
            </div>

          ) : (
            <>
              {/* You pay */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#6b7280]">
                    You pay
                  </label>
                  <span className="font-mono text-[10px] text-[#6b7280]">
                    Balance:{' '}
                    <span className="text-[#e8eaed]">{solBalance.toFixed(4)} SOL</span>
                  </span>
                </div>
                <div
                  className="relative"
                  style={{ background: '#0a0b0d', border: '1px solid #2a2d35', borderRadius: 3 }}
                >
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none">
                    <SolIcon />
                    <span className="font-mono text-[11px] font-bold text-white">SOL</span>
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={solAmount}
                    onChange={e => { setSolAmount(e.target.value); setStatus('idle'); setErrorMsg(''); }}
                    placeholder="0.00"
                    className="w-full pl-14 pr-14 py-3 font-mono text-[13px] text-white text-right placeholder-[#374151] focus:outline-none bg-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <button
                    type="button"
                    onClick={() => { setSolAmount(maxSol.toFixed(4)); setStatus('idle'); setErrorMsg(''); }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 font-mono text-[10px] font-bold uppercase text-[#00ff88] hover:text-[#00e87a] transition-colors px-1.5 py-0.5"
                    style={{ background: '#1e2025' }}
                  >
                    MAX
                  </button>
                </div>
              </div>

              {/* Arrow divider */}
              <div className="flex justify-center -my-0.5">
                <div
                  className="w-7 h-7 flex items-center justify-center"
                  style={{ background: '#1e2025' }}
                >
                  <svg className="w-3.5 h-3.5 text-[#6b7280]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </div>
              </div>

              {/* You receive */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#6b7280]">
                    You receive
                  </label>
                  {quote && (
                    <span className="font-mono text-[10px] text-[#6b7280]">
                      Impact:{' '}
                      <span className={priceImpact > 1 ? 'text-[#ff4444]' : 'text-[#6b7280]'}>
                        {priceImpact < 0.01 ? '<0.01' : priceImpact.toFixed(2)}%
                      </span>
                    </span>
                  )}
                </div>
                <div
                  className="relative"
                  style={{ background: '#0a0b0d', border: '1px solid #2a2d35', borderRadius: 3 }}
                >
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none">
                    <UsdcIcon />
                    <span className="font-mono text-[11px] font-bold text-white">USDC</span>
                  </div>
                  <div className="pl-14 pr-4 py-3 font-mono text-[13px] text-right h-[46px] flex items-center justify-end">
                    {quoting ? (
                      <span className="font-mono text-[10px] text-[#374151]">Getting quote…</span>
                    ) : quoteError ? (
                      <span className="text-[#ff4444] text-[10px]">—</span>
                    ) : expectedUsdc > 0 ? (
                      <span className="text-white tabular-nums">{expectedUsdc.toFixed(2)}</span>
                    ) : (
                      <span className="text-[#374151]">0.00</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Slippage */}
              <div className="flex items-center justify-between px-0.5">
                <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#6b7280]">
                  Slippage tolerance
                </span>
                <span className="font-mono text-[10px] text-[#6b7280]">0.5%</span>
              </div>

              {/* Quote error */}
              {quoteError && (
                <p className="font-mono text-[10px] text-[#ff4444] bg-[#ff4444]/5 border border-[#ff4444]/20 px-3 py-2"
                  style={{ borderRadius: 3 }}>
                  {quoteError}
                </p>
              )}

              {/* Tx error */}
              {errorMsg && (
                <p className="font-mono text-[10px] text-[#ff4444] bg-[#ff4444]/5 border border-[#ff4444]/20 px-3 py-2"
                  style={{ borderRadius: 3 }}>
                  {errorMsg}
                </p>
              )}

              {/* Swap button */}
              <button
                onClick={handleSwap}
                disabled={!canSwap}
                className="w-full py-3 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[#0a0b0d] disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.99]"
                style={{ background: '#00ff88', borderRadius: 3 }}
              >
                {status === 'pending' ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    Swapping…
                  </span>
                ) : quoting ? 'Fetching quote…' : 'SWAP'}
              </button>

              <p className="font-mono text-[10px] text-center text-[#374151]">Powered by Jupiter</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────
function SolIcon() {
  return (
    <svg className="w-4 h-4 shrink-0 rounded-full" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="12" fill="#9945FF"/>
      <path d="M6.5 16h11l-1.5 1.5h-11L6.5 16zm0-9h11l-1.5-1.5h-11L6.5 7zm2 4.5h9l-1.5-1.5h-9l-1 1 1 .5z" fill="white" fillOpacity="0.9"/>
    </svg>
  );
}
function UsdcIcon() {
  return (
    <svg className="w-4 h-4 shrink-0 rounded-full" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="12" fill="#2775CA"/>
      <path d="M12.75 17.45V18.5h-1.5v-1.04a5.27 5.27 0 0 1-3.5-1.96l1.1-1.1c.72.9 1.76 1.44 2.9 1.44 1.38 0 2.25-.7 2.25-1.72 0-.9-.6-1.46-2.15-1.9-1.87-.53-3.1-1.3-3.1-3 0-1.44 1.02-2.54 2.5-2.87V5.5h1.5v1.04a4.7 4.7 0 0 1 2.76 1.86l-1.1 1.1a2.95 2.95 0 0 0-2.41-1.3c-1.2 0-1.93.62-1.93 1.53 0 .83.56 1.33 2.25 1.83 1.88.53 3.02 1.35 3.02 3.07 0 1.53-1.06 2.63-2.59 2.82z" fill="white"/>
    </svg>
  );
}
