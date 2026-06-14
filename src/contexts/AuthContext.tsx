'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
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

const STORAGE_KEY  = 'csliquid_auth';
const KEYPAIR_KEY  = 'guest_keypair';

interface AuthContextValue {
  user:            AuthUser | null;
  hydrated:        boolean;
  isAuthenticated: boolean;
  loginWithEmail:  (email: string) => void;
  loginWithWallet: (address: string) => void;
  loginAsGuest:    () => void;
  logout:          () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,     setUser]     = useState<AuthUser | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw      = localStorage.getItem(STORAGE_KEY);
      const keypairB58 = localStorage.getItem(KEYPAIR_KEY);

      if (raw) {
        const parsed = JSON.parse(raw) as AuthUser;
        // If stored as generated but keypair was cleared, treat as unauthenticated
        if (parsed.type === 'generated' && !keypairB58) {
          localStorage.removeItem(STORAGE_KEY);
        } else {
          setUser(parsed);
        }
      } else if (keypairB58) {
        // Auto-restore: keypair in storage but no auth record → re-derive address
        try {
          const kp = Keypair.fromSecretKey(decodeBase58(keypairB58));
          const restored: AuthUser = { type: 'generated', address: kp.publicKey.toBase58() };
          setUser(restored);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(restored));
        } catch {
          localStorage.removeItem(KEYPAIR_KEY);
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

  const loginWithEmail  = useCallback((email: string)  => persist({ type: 'email',  email }),   []);
  const loginWithWallet = useCallback((address: string) => persist({ type: 'wallet', address }), []);

  const loginAsGuest = useCallback(() => {
    // Reuse existing keypair if present, generate new one otherwise
    const existing = localStorage.getItem(KEYPAIR_KEY);
    let address: string;
    if (existing) {
      try {
        address = Keypair.fromSecretKey(decodeBase58(existing)).publicKey.toBase58();
      } catch {
        const kp = Keypair.generate();
        localStorage.setItem(KEYPAIR_KEY, encodeBase58(kp.secretKey));
        address = kp.publicKey.toBase58();
      }
    } else {
      const kp = Keypair.generate();
      localStorage.setItem(KEYPAIR_KEY, encodeBase58(kp.secretKey));
      address = kp.publicKey.toBase58();
    }
    persist({ type: 'generated', address });
  }, []);

  const logout = useCallback(() => {
    // Always clear the generated keypair on explicit logout
    localStorage.removeItem(KEYPAIR_KEY);
    persist(null);
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      hydrated,
      isAuthenticated: user !== null,
      loginWithEmail,
      loginWithWallet,
      loginAsGuest,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
