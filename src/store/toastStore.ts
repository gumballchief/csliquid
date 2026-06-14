import { create } from 'zustand';

export interface TxToast {
  id:        string;
  txSig:     string;
  action:    'open' | 'close';
  side?:     'long' | 'short';
  skinName:  string;
  createdAt: number;
}

interface ToastState {
  toasts: TxToast[];
  addToast: (toast: Omit<TxToast, 'id' | 'createdAt'>) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  addToast: (toast) => {
    const id = crypto.randomUUID();
    set((s) => ({ toasts: [...s.toasts, { ...toast, id, createdAt: Date.now() }] }));
    // Auto-dismiss after 8 seconds
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 8_000);
  },

  removeToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
