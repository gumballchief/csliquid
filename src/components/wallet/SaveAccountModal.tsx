'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

export default function SaveAccountModal({ onClose }: { onClose: () => void }) {
  const { loginWithEmail } = useAuth();

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [showPw,   setShowPw]   = useState(false);
  const [errors,   setErrors]   = useState<Record<string, string>>({});
  const [saved,    setSaved]    = useState(false);

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!email) e.email = 'Email is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Enter a valid email.';
    if (!password) e.password = 'Password is required.';
    else if (password.length < 6) e.password = 'Minimum 6 characters.';
    if (confirm !== password) e.confirm = 'Passwords do not match.';
    return e;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    loginWithEmail(email);
    setSaved(true);
  }

  const inputStyle = (field: string) => ({
    background: '#0a0b0d',
    border: `1px solid ${errors[field] ? '#ff4444' : '#2a2d35'}`,
    borderRadius: 3,
  });

  return (
    <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center md:p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />

      <div
        className="relative w-full md:max-w-sm overflow-y-auto max-h-[100dvh] md:max-h-[90vh]"
        style={{ background: '#111214', border: '1px solid #1e2025', borderRadius: '4px 4px 0 0' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e2025]">
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#6b7280]">
            Save Account
          </span>
          <button
            onClick={onClose}
            className="font-mono text-[#6b7280] hover:text-[#e8eaed] transition-colors leading-none"
          >
            ✕
          </button>
        </div>

        <div className="p-4">
          {saved ? (
            <div className="space-y-4 text-center py-2">
              <p className="font-mono text-[12px] uppercase tracking-[0.1em] text-[#00ff88]">Account saved</p>
              <p className="font-mono text-[11px] text-[#6b7280] leading-relaxed">
                Logged in as <span className="text-[#e8eaed]">{email}</span>. Your wallet keypair is stored in this browser.
              </p>
              <p className="font-mono text-[10px] text-[#374151] leading-relaxed px-2">
                Export your private key as a backup before clearing browser data.
              </p>
              <button
                onClick={onClose}
                className="w-full py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-[#e8eaed] hover:text-white transition-colors"
                style={{ background: '#1e2025', borderRadius: 3 }}
              >
                Done
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="space-y-3">
              <p className="font-mono text-[11px] text-[#6b7280] leading-relaxed">
                Link an email and password to your generated wallet so you can recover access later.
              </p>

              <div>
                <label className="block font-mono text-[10px] uppercase tracking-[0.08em] text-[#6b7280] mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  autoComplete="email"
                  placeholder="you@example.com"
                  onChange={e => { setEmail(e.target.value); setErrors(v => ({ ...v, email: '' })); }}
                  className="w-full px-3 py-2 font-mono text-[12px] text-[#e8eaed] placeholder-[#374151] focus:outline-none transition-colors"
                  style={inputStyle('email')}
                />
                {errors.email && <p className="mt-1 font-mono text-[10px] text-[#ff4444]">{errors.email}</p>}
              </div>

              <div>
                <label className="block font-mono text-[10px] uppercase tracking-[0.08em] text-[#6b7280] mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    autoComplete="new-password"
                    placeholder="••••••••"
                    onChange={e => { setPassword(e.target.value); setErrors(v => ({ ...v, password: '' })); }}
                    className="w-full px-3 py-2 pr-10 font-mono text-[12px] text-[#e8eaed] placeholder-[#374151] focus:outline-none transition-colors"
                    style={inputStyle('password')}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6b7280] hover:text-[#9ca3af] transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      {showPw
                        ? <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                        : <><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></>
                      }
                    </svg>
                  </button>
                </div>
                {errors.password && <p className="mt-1 font-mono text-[10px] text-[#ff4444]">{errors.password}</p>}
              </div>

              <div>
                <label className="block font-mono text-[10px] uppercase tracking-[0.08em] text-[#6b7280] mb-1.5">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirm}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  onChange={e => { setConfirm(e.target.value); setErrors(v => ({ ...v, confirm: '' })); }}
                  className="w-full px-3 py-2 font-mono text-[12px] text-[#e8eaed] placeholder-[#374151] focus:outline-none transition-colors"
                  style={inputStyle('confirm')}
                />
                {errors.confirm && <p className="mt-1 font-mono text-[10px] text-[#ff4444]">{errors.confirm}</p>}
              </div>

              <button
                type="submit"
                className="w-full py-2.5 font-mono text-[12px] font-bold uppercase tracking-[0.1em] text-[#0a0b0d] hover:bg-[#00e87a] active:scale-[0.99] transition-all"
                style={{ background: '#00ff88', borderRadius: 3 }}
              >
                Save Account
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
