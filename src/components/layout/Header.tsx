'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import WalletButton from '@/components/wallet/WalletButton';
import Logo from '@/components/layout/Logo';

const NAV = [
  { label: 'Trade',       href: '/trade' },
  { label: 'CS500',       href: '/cs500' },
  { label: 'Pool',        href: '/pool' },
  { label: 'Stats',       href: '/stats' },
  { label: 'Portfolio',   href: '/portfolio' },
  { label: 'Prize Pool',  href: '/prize-pool' },
  { label: 'Leaderboard', href: '/leaderboard' },
  { label: 'Referral',    href: '/referral' },
  { label: 'Docs',        href: '/docs' },
];

export default function Header() {
  const pathname      = usePathname();
  const [open, setOpen] = useState(false);
  const drawerRef     = useRef<HTMLDivElement>(null);

  // Close drawer on route change
  useEffect(() => { setOpen(false); }, [pathname]);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Prevent body scroll when drawer open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  return (
    <>
      <header className="h-10 border-b border-tx-border bg-tx-bg flex items-center px-4 sticky top-0 z-50">

        {/* Left: Logo */}
        <Link href="/" className="flex items-center shrink-0">
          <Logo size={22} />
        </Link>

        {/* Center: Desktop nav */}
        <nav className="hidden md:flex absolute left-1/2 -translate-x-1/2 items-center">
          {NAV.map(({ label, href }) => (
            <Link
              key={label}
              href={href}
              className={`px-3 h-10 flex items-center text-[11px] font-mono uppercase tracking-[0.05em] transition-colors border-b-2 ${
                pathname === href
                  ? 'text-tx-green border-tx-green'
                  : 'text-tx-muted hover:text-tx-text border-transparent'
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* Right: Wallet + hamburger */}
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <WalletButton />

          {/* Hamburger — mobile only */}
          <button
            className="md:hidden flex flex-col justify-center items-center w-10 h-10 gap-[5px] shrink-0"
            onClick={() => setOpen(o => !o)}
            aria-label="Menu"
          >
            <span
              className="w-5 h-[1.5px] bg-tx-muted transition-all duration-200"
              style={open ? { transform: 'translateY(6.5px) rotate(45deg)' } : {}}
            />
            <span
              className="w-5 h-[1.5px] bg-tx-muted transition-all duration-200"
              style={open ? { opacity: 0 } : {}}
            />
            <span
              className="w-5 h-[1.5px] bg-tx-muted transition-all duration-200"
              style={open ? { transform: 'translateY(-6.5px) rotate(-45deg)' } : {}}
            />
          </button>
        </div>
      </header>

      {/* Mobile drawer overlay */}
      {open && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/60" onClick={() => setOpen(false)} />
      )}

      {/* Mobile drawer */}
      <div
        ref={drawerRef}
        className="md:hidden fixed top-10 right-0 h-[calc(100vh-2.5rem)] w-64 z-50 flex flex-col transition-transform duration-200"
        style={{
          background: '#111214',
          borderLeft: '1px solid #1e2025',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
        }}
      >
        <nav className="flex-1 overflow-y-auto">
          {NAV.map(({ label, href }) => (
            <Link
              key={label}
              href={href}
              onClick={() => setOpen(false)}
              className={`flex items-center px-5 h-12 text-[14px] font-mono uppercase tracking-[0.06em] transition-colors border-b ${
                pathname === href
                  ? 'text-tx-green border-tx-border bg-tx-green/5'
                  : 'text-tx-muted hover:text-tx-text border-[#1e2025]'
              }`}
            >
              {pathname === href && <span className="w-1 h-full absolute left-0 bg-tx-green" />}
              {label}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-tx-border">
          <p className="text-[9px] font-mono text-tx-dim uppercase tracking-widest text-center">CSLIQUID · Solana Devnet</p>
        </div>
      </div>
    </>
  );
}
