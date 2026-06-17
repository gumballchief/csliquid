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
  | { type: 'email';     email: string   }
  | { type: 'wallet';    address: string }
  | { type: 'generated'; address: string }   // browser-generated keypair
  | { type: 'guest' };                        // legacy / no-keypair guest

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
            // Keypair was cleared — fall through to auto-generate below.
            localStorage.removeItem(STORAGE_KEY);
          } else {
            ensureNewKeyFormat(kp);
            setUser(parsed);
          }

        } else if (parsed.type === 'email') {
          // Migrate email records to a session keypair.
          const kp = (keypairB58 ? tryLoadB58(keypairB58) : null) ?? Keypair.generate();
          storeKeypairDual(kp);
          const migrated: AuthUser = { type: 'generated', address: kp.publicKey.toBase58() };
          setUser(migrated);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));

        } else if (parsed.type === 'wallet' && keypairB58) {
          // Phantom auto-connect overwrote a session wallet auth — restore the session wallet.
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
        // No auth record — scan for an existing session keypair first.
        const kp = scanForKeypair() ?? (keypairB58 ? tryLoadB58(keypairB58) : null);

        if (kp) {
          storeKeypairDual(kp);
          const restored: AuthUser = { type: 'generated', address: kp.publicKey.toBase58() };
          setUser(restored);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(restored));
        } else {
          // Brand new visitor — auto-generate a session wallet so they never see the auth gate.
          const newKp = Keypair.generate();
          storeKeypairDual(newKp);
          const newUser: AuthUser = { type: 'generated', address: newKp.publicKey.toBase58() };
          setUser(newUser);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(newUser));
        }
      }
    } catch {}
    setHydrated(true);
  }, []);

  function persist(next: AuthUser | null) {
    setUser(next);
    if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else      localStorage.removeItem(STORAGE_KEY);
  }

  const loginWithEmail = useCallback((_email: string) => {
    const existing = localStorage.getItem(KEYPAIR_KEY);
    const kp = (existing ? tryLoadB58(existing) : null) ?? Keypair.generate();
    storeKeypairDual(kp);
    persist({ type: 'generated', address: kp.publicKey.toBase58() });
  }, []);

  const loginWithWallet = useCallback((address: string) => persist({ type: 'wallet', address }), []);

  const loginAsGuest = useCallback(() => {
    const existing = localStorage.getItem(KEYPAIR_KEY);
    const kp = (existing ? tryLoadB58(existing) : null) ?? Keypair.generate();
    storeKeypairDual(kp);
    persist({ type: 'generated', address: kp.publicKey.toBase58() });
  }, []);

  const logout = useCallback(() => {
    // Remove canonical key and legacy key.
    if (user?.type === 'generated') {
      localStorage.removeItem(keypairKeyFor(user.address));
    }
    localStorage.removeItem(KEYPAIR_KEY);
    Object.keys(localStorage)
      .filter(k => k.startsWith(KEYPAIR_PREFIX))
      .forEach(k => localStorage.removeItem(k));
    persist(null);
    // After logout, auto-generate a fresh session wallet.
    const newKp = Keypair.generate();
    storeKeypairDual(newKp);
    const newUser: AuthUser = { type: 'generated', address: newKp.publicKey.toBase58() };
    setUser(newUser);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newUser));
  }, [user]);

  const getKeypair = useCallback((): Keypair | null => {
    if (!user || user.type !== 'generated') return null;
    return loadKeypairForAddress(user.address);
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
