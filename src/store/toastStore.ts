import { create } from 'zustand';

export interface TxToast {
  id:          string;
  txSig:       string;
  action:      'open' | 'close';
  side?:       'long' | 'short';
  skinName:    string;
  leverage?:   number;
  notional?:   number;
  entryPrice?: number;
  createdAt:   number;
}

export interface InfoToast {
  id:        string;
  message:   string;
  txSig?:    string;
  createdAt: number;
}

interface ToastState {
  toasts:     TxToast[];
  infoToasts: InfoToast[];
  addToast:   (toast: Omit<TxToast, 'id' | 'createdAt'>) => void;
  removeToast:(id: string) => void;
  addInfo:    (message: string, txSig?: string) => void;
  removeInfo: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts:     [],
  infoToasts: [],

  addToast: (toast) => {
    const id = crypto.randomUUID();
    set((s) => ({ toasts: [...s.toasts, { ...toast, id, createdAt: Date.now() }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 6_000);
  },

  removeToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  addInfo: (message, txSig) => {
    const id = crypto.randomUUID();
    set((s) => ({ infoToasts: [...s.infoToasts, { id, message, txSig, createdAt: Date.now() }] }));
    setTimeout(() => {
      set((s) => ({ infoToasts: s.infoToasts.filter((t) => t.id !== id) }));
    }, 10_000);
  },

  removeInfo: (id) =>
    set((s) => ({ infoToasts: s.infoToasts.filter((t) => t.id !== id) })),
}));
