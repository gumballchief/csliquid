'use client';

import { type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

// Path prefixes that require authentication
const PROTECTED_PREFIXES = [
  '/trade',
  '/portfolio',
  '/pool',
  '/stats',
  '/leaderboard',
  '/referral',
  '/prize-pool',
];

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    p => pathname === p || pathname.startsWith(p + '/'),
  );
}

/**
 * Route-level guard. AppShell in ClientLayout already ensures isAuthenticated
 * is true before this renders, so this primarily protects against direct URL
 * navigation and provides a safety net.
 */
export default function AuthGuard({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const pathname = usePathname();

  if (!isProtected(pathname)) return <>{children}</>;
  if (!isAuthenticated) return null;
  return <>{children}</>;
}
