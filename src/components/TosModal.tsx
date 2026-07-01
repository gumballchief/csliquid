'use client';

import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

const COOKIE_NAME = 'tos_accepted';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

function getCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.split('; ').find(row => row.startsWith(name + '='));
  return match ? decodeURIComponent(match.split('=')[1]) : undefined;
}

function setAcceptedCookie(): void {
  const value = new Date().toISOString();
  document.cookie = [
    `${COOKIE_NAME}=${encodeURIComponent(value)}`,
    `Max-Age=${COOKIE_MAX_AGE}`,
    'Path=/',
    'SameSite=Lax',
  ].join('; ');
}

async function logAcceptance(wallet?: string): Promise<void> {
  try {
    await fetch('/api/tos/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet: wallet ?? null }),
    });
  } catch {
    // Non-fatal — cookie is the source of truth for the user; DB is for records.
  }
}

export default function TosModal() {
  const { publicKey } = useWallet();
  const [visible, setVisible] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!getCookie(COOKIE_NAME)) {
      setVisible(true);
    }
  }, []);

  async function handleAccept() {
    if (!agreed) return;
    setSubmitting(true);
    setAcceptedCookie();
    await logAcceptance(publicKey?.toBase58());
    setVisible(false);
    setSubmitting(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center md:p-4 bg-black/70">
      <div className="w-full md:max-w-[480px] flex flex-col overflow-hidden" style={{
        background: '#111214',
        border: '1px solid #1e2025',
        borderRadius: '4px 4px 0 0',
        maxHeight: '92dvh',
      }}>

        {/* Header */}
        <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid #1e2025' }}>
          <p style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#6b7280', margin: 0 }}>
            Terms of Service
          </p>
          <p style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10, color: '#374151', margin: '4px 0 0' }}>
            Please read and accept before continuing
          </p>
        </div>

        {/* Scrollable body */}
        <div style={{
          padding: '14px 16px',
          overflowY: 'auto',
          maxHeight: 300,
          flex: '1 1 auto',
          scrollbarWidth: 'thin',
          scrollbarColor: '#374151 #1e2025',
        }}>
          <p style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, color: '#6b7280', lineHeight: 1.6, margin: 0 }}>
            By using <span style={{ color: '#e8eaed' }}>CSLIQUID</span>, you agree to the following terms. Please read them carefully.
          </p>

          <TosSection title="1. Nature of the Platform">
            CSLIQUID offers synthetic perpetual futures contracts referenced to CS2 cosmetic item
            ("skin") price indices. Trading on CSLIQUID does not involve the purchase, transfer,
            or custody of any actual CS2 skins or other digital assets. All positions are settled
            in USDC.
          </TosSection>

          <TosSection title="2. Eligibility">
            You confirm that you are at least 18 years of age and that accessing or using CSLIQUID
            is not prohibited by the laws of your jurisdiction.{' '}
            <span style={{ color: '#f59e0b' }}>
              Access is not available to residents of the Netherlands, Belgium, or any other
              jurisdiction where synthetic derivatives trading is restricted or prohibited.
            </span>
          </TosSection>

          <TosSection title="3. Risk Acknowledgement">
            Trading perpetual futures involves substantial risk of loss. Leverage amplifies both
            gains and losses. Prices are volatile and positions may be liquidated without notice.
            You may lose your entire deposited collateral. Only trade with funds you can afford to
            lose entirely.
          </TosSection>

          <TosSection title="4. No Financial Advice">
            Nothing on CSLIQUID constitutes financial, investment, or legal advice. All
            information is provided for informational purposes only.
          </TosSection>

          <TosSection title="5. Record Keeping">
            By accepting these terms, your connected wallet address (if any) and the timestamp
            of acceptance are recorded for compliance and audit purposes.
          </TosSection>

          <TosSection title="6. Protocol Risk">
            CSLIQUID is a non-custodial, experimental protocol deployed on Solana mainnet.
            Smart contracts may contain bugs. The protocol may be paused, modified, or
            discontinued at any time. There is no guarantee of funds recovery.
          </TosSection>
        </div>

        {/* Footer */}
        <div style={{ borderTop: '1px solid #1e2025', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Checkbox row */}
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
            <div
              onClick={() => setAgreed(v => !v)}
              style={{
                width: 14, height: 14, flexShrink: 0, marginTop: 1,
                background: agreed ? '#00ff88' : '#0a0b0d',
                border: `1px solid ${agreed ? '#00ff88' : '#1e2025'}`,
                borderRadius: 2,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', transition: 'all 0.1s',
              }}
            >
              {agreed && (
                <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                  <path d="M1 3.5L3.5 6L8 1" stroke="#0a0b0d" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
            <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, color: '#6b7280', lineHeight: 1.5 }}>
              I have read and agree to the Terms of Service. I confirm I am not a resident of a restricted jurisdiction.
            </span>
          </label>

          <button
            onClick={handleAccept}
            disabled={!agreed || submitting}
            style={{
              width: '100%',
              padding: '9px 0',
              background: agreed ? '#00ff88' : '#1e2025',
              color: agreed ? '#0a0b0d' : '#374151',
              fontFamily: 'ui-monospace, monospace',
              fontSize: 12,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              borderRadius: 3,
              border: 'none',
              cursor: agreed && !submitting ? 'pointer' : 'not-allowed',
              transition: 'background 0.1s, color 0.1s',
            }}
          >
            {submitting ? 'Saving…' : 'I Agree — Enter Platform'}
          </button>
        </div>
      </div>
    </div>
  );
}

function TosSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 16 }}>
      <h3 style={{
        fontFamily: 'ui-monospace, monospace', fontSize: 10, textTransform: 'uppercase',
        letterSpacing: '0.1em', color: '#e8eaed', margin: '0 0 4px',
      }}>
        {title}
      </h3>
      <p style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, color: '#6b7280', lineHeight: 1.6, margin: 0 }}>
        {children}
      </p>
    </section>
  );
}
