import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { Analytics } from '@vercel/analytics/next';
import WalletContextProvider from '@/contexts/WalletContextProvider';
import { AuthProvider } from '@/contexts/AuthContext';
import AuthGuard from '@/components/auth/AuthGuard';
import Header from '@/components/layout/Header';
import PriceTicker from '@/components/layout/PriceTicker';
import TxToastContainer from '@/components/ui/TxToast';
import TosModal from '@/components/TosModal';

const geistSans = localFont({
  src: './fonts/GeistVF.woff',
  variable: '--font-geist-sans',
  weight: '100 900',
});
const geistMono = localFont({
  src: './fonts/GeistMonoVF.woff',
  variable: '--font-geist-mono',
  weight: '100 900',
});

export const metadata: Metadata = {
  title: 'CSLIQUID — CS2 Perpetual Futures on Solana',
  description: 'Trade perpetual futures on CS2 skins. Powered by Solana.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" style={{ backgroundColor: '#0a0b0d', colorScheme: 'dark' }}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <style>{`html,body{background:#0a0b0d;color:#e8eaed}`}</style>
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-tx-bg text-tx-text min-h-screen`} style={{ backgroundColor: '#0a0b0d' }}>
        <WalletContextProvider>
          <AuthProvider>
            <TosModal />
            <PriceTicker />
            <Header />
            <AuthGuard>
              {children}
            </AuthGuard>
            <TxToastContainer />
          </AuthProvider>
        </WalletContextProvider>
        <Analytics />
      </body>
    </html>
  );
}
