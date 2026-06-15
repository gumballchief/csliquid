'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

export default function RefLandingPage() {
  const { username } = useParams<{ username: string }>();
  const router = useRouter();

  useEffect(() => {
    async function activate() {
      try {
        const res = await fetch(`/api/referral/lookup?username=${encodeURIComponent(username)}`);
        const { wallet } = await res.json() as { wallet: string | null };

        if (wallet) {
          // 30-day cookie — tracked by the trade execution code
          document.cookie = `referrer=${wallet}; max-age=2592000; path=/; SameSite=Lax`;
          // Increment click counter (fire-and-forget)
          fetch('/api/referral/click', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wallet }),
          }).catch(() => {});
        }
      } catch {}

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
