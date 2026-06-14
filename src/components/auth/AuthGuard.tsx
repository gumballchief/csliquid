'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

// Pages anyone can visit without being logged in
const PUBLIC_PATHS = new Set(['/', '/login', '/signup', '/blocked']);

export default function AuthGuard({ children }: { children: ReactNode }) {
  const { isAuthenticated, hydrated } = useAuth();
  const pathname = usePathname();
  const router   = useRouter();

  const isPublic = PUBLIC_PATHS.has(pathname);

  useEffect(() => {
    if (hydrated && !isAuthenticated && !isPublic) {
      router.replace('/login');
    }
  }, [hydrated, isAuthenticated, isPublic, router]);

  // Suppress content flash while localStorage hydrates
  if (!hydrated) return null;

  // Redirect in-flight — render nothing so protected content is never visible
  if (!isAuthenticated && !isPublic) return null;

  return <>{children}</>;
}
