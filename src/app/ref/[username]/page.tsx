'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

export default function RefLandingPage() {
  const { username } = useParams<{ username: string }>();
  const router = useRouter();

  useEffect(() => {
    async function activate() {
      console.log('[ref] landing for username:', username);
      try {
        const lookupUrl = `/api/referral/lookup?username=${encodeURIComponent(username)}`;
        console.log('[ref] fetching lookup:', lookupUrl);
        const res  = await fetch(lookupUrl);
        const data = await res.json() as { wallet: string | null };
        console.log('[ref] lookup result:', data);

        const { wallet } = data;
        if (wallet) {
          // 30-day cookie — read by the trade execution code to credit the referrer
          document.cookie = `referrer=${encodeURIComponent(wallet)}; max-age=2592000; path=/; SameSite=Lax`;
          console.log('[ref] cookie set, referrer wallet:', wallet);

          // Increment click counter
          fetch('/api/referral/click', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ wallet }),
          })
            .then(r => r.json())
            .then(d => console.log('[ref] click tracked:', d))
            .catch(e => console.error('[ref] click track error:', e));
        } else {
          console.warn('[ref] no wallet found for username:', username);
        }
      } catch (err) {
        console.error('[ref] activate error:', err);
      }

      router.replace('/');
    }

    activate();
  }, [username, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-tx-bg">
      <p className="font-mono text-[11px] text-tx-dim uppercase tracking-wider">
        Redirecting…
      </p>
    </div>
  );
}
