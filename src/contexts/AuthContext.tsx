'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Keypair } from '@solana/web3.js';
import { encodeBase58, decodeBase58 } from '@/lib/base58';

export type AuthUser =
  | { type: 'email';     email: string; address: string }  // email login, has session keypair
  | { type: 'wallet';    address: string }                  // external wallet (Phantom etc)
  | { type: 'generated'; address: string }                  // guest session keypair
  | { type: 'guest' };                                      // legacy / no-keypair guest

const STORAGE_KEY    = 'csliquid_auth';
const KEYPAIR_KEY    = 'guest_keypair';        // legacy alias — kept so existing callsites work
const KEYPAIR_PREFIX = 'cs-futures-wallet-';  // canonical per-address key format

function keypairKeyFor(address: string): string {
  return `${KEYPAIR_PREFIX}${address}`;
}

// Write to both the legacy fixed key and the new per-address key.
function storeKeypairDual(kp: Keypair): void {
  const b58 = encodeBase58(kp.secretKey);
  localStorage.setItem(KEYPAIR_KEY, b58);
  localStorage.setItem(keypairKeyFor(kp.publicKey.toBase58()), b58);
}

// Load a keypair for a known address — tries new format first, falls back to legacy.
function loadKeypairForAddress(address: string): Keypair | null {
  const raw = localStorage.getItem(keypairKeyFor(address)) ?? localStorage.getItem(KEYPAIR_KEY);
  if (!raw) return null;
  try { return Keypair.fromSecretKey(decodeBase58(raw)); } catch { return null; }
}

// Scan all keys for any cs-futures-wallet-* entry.
function scanForKeypair(): Keypair | null {
  for (const key of Object.keys(localStorage)) {
    if (!key.startsWith(KEYPAIR_PREFIX)) continue;
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    try { return Keypair.fromSecretKey(decodeBase58(raw)); } catch {}
  }
  return null;
}

function tryLoadB58(b58: string): Keypair | null {
  try { return Keypair.fromSecretKey(decodeBase58(b58)); } catch { return null; }
}

// Ensure the canonical cs-futures-wallet-[address] key is written (migration).
function ensureNewKeyFormat(kp: Keypair): void {
  const key = keypairKeyFor(kp.publicKey.toBase58());
  if (!localStorage.getItem(key)) {
    localStorage.setItem(key, encodeBase58(kp.secretKey));
  }
}

interface AuthContextValue {
  user:            AuthUser | null;
  hydrated:        boolean;
  isAuthenticated: boolean;
  loginWithEmail:  (email: string) => void;
  loginWithWallet: (address: string) => void;
  loginAsGuest:    () => void;
  logout:          () => void;
  getKeypair:      () => Keypair | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,     setUser]     = useState<AuthUser | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw        = localStorage.getItem(STORAGE_KEY);
      const keypairB58 = localStorage.getItem(KEYPAIR_KEY);

      if (raw) {
        const parsed = JSON.parse(raw) as AuthUser;

        if (parsed.type === 'generated') {
          const kp = loadKeypairForAddress(parsed.address);
          if (!kp) {
            // Keypair was cleared — show auth screen.
            localStorage.removeItem(STORAGE_KEY);
          } else {
            ensureNewKeyFormat(kp);
            setUser(parsed);
          }

        } else if (parsed.type === 'email') {
          // Email user — restore keypair from the stored address.
          const emailUser = parsed as { type: 'email'; email: string; address?: string };
          const addr = emailUser.address;
          const kp = (addr ? loadKeypairForAddress(addr) : null)
            ?? (keypairB58 ? tryLoadB58(keypairB58) : null);
          if (kp) {
            storeKeypairDual(kp);
            const restored: AuthUser = { type: 'email', email: emailUser.email, address: kp.publicKey.toBase58() };
            setUser(restored);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(restored));
          } else {
            // Keypair gone (cleared localStorage) — send back to auth screen.
            localStorage.removeItem(STORAGE_KEY);
          }

        } else if (parsed.type === 'wallet' && keypairB58) {
          // Phantom auto-connect overwrote a session wallet — restore the session wallet.
          const kp = tryLoadB58(keypairB58);
          if (kp) {
            storeKeypairDual(kp);
            const restored: AuthUser = { type: 'generated', address: kp.publicKey.toBase58() };
            setUser(restored);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(restored));
          } else {
            localStorage.removeItem(KEYPAIR_KEY);
            setUser(parsed);
          }

        } else {
          setUser(parsed);
        }

      } else {
        // No auth record — scan for a pre-existing session keypair (e.g. lost csliquid_auth key).
        const kp = scanForKeypair() ?? (keypairB58 ? tryLoadB58(keypairB58) : null);

        if (kp) {
          storeKeypairDual(kp);
          const restored: AuthUser = { type: 'generated', address: kp.publicKey.toBase58() };
          setUser(restored);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(restored));
        }
        // No keypair found and no stored user → user stays null, AuthScreen will show.
      }
    } catch {}
    setHydrated(true);
  }, []);

  function persist(next: AuthUser | null) {
    setUser(next);
    if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else      localStorage.removeItem(STORAGE_KEY);
  }

  const loginWithEmail = useCallback((email: string) => {
    const existing = localStorage.getItem(KEYPAIR_KEY);
    const kp = (existing ? tryLoadB58(existing) : null) ?? Keypair.generate();
    storeKeypairDual(kp);
    persist({ type: 'email', email, address: kp.publicKey.toBase58() });
  }, []);

  const loginWithWallet = useCallback((address: string) => persist({ type: 'wallet', address }), []);

  const loginAsGuest = useCallback(() => {
    const existing = localStorage.getItem(KEYPAIR_KEY);
    const kp = (existing ? tryLoadB58(existing) : null) ?? Keypair.generate();
    storeKeypairDual(kp);
    persist({ type: 'generated', address: kp.publicKey.toBase58() });
  }, []);

  const logout = useCallback(() => {
    if (user?.type === 'generated' || user?.type === 'email') {
      localStorage.removeItem(keypairKeyFor((user as { address: string }).address));
    }
    localStorage.removeItem(KEYPAIR_KEY);
    Object.keys(localStorage)
      .filter(k => k.startsWith(KEYPAIR_PREFIX))
      .forEach(k => localStorage.removeItem(k));
    // Clear auth — user will see AuthScreen again. No auto-generation.
    persist(null);
  }, [user]);

  const getKeypair = useCallback((): Keypair | null => {
    if (!user) return null;
    if (user.type === 'generated' || user.type === 'email') {
      return loadKeypairForAddress((user as { address: string }).address);
    }
    return null;
  }, [user]);

  const ctxValue = useMemo(() => ({
    user,
    hydrated,
    isAuthenticated: user !== null,
    loginWithEmail,
    loginWithWallet,
    loginAsGuest,
    logout,
    getKeypair,
  }), [user, hydrated, loginWithEmail, loginWithWallet, loginAsGuest, logout, getKeypair]);

  return (
    <AuthContext.Provider value={ctxValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
