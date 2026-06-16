import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import WalletContextProvider from '@/contexts/WalletContextProvider';
import { AuthProvider } from '@/contexts/AuthContext';
import AuthGuard from '@/components/auth/AuthGuard';
import Header from '@/components/layout/Header';
import PriceTicker from '@/components/layout/PriceTicker';
import TxToastContainer from '@/components/ui/TxToast';
import AirdropSyncer from '@/components/ui/AirdropSyncer';
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
  title: 'CSLIQUID',
  description: 'CS2 Skin Perpetual Futures on Solana',
  icons: {
    icon:     '/favicon.svg',
    shortcut: '/favicon.svg',
    apple:    '/favicon.svg',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" style={{ backgroundColor: '#0a0b0d', colorScheme: 'dark' }}>
      <head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="alternate icon" href="/favicon.ico" type="image/x-icon" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <style>{`html,body{background:#0a0b0d;color:#e8eaed}`}</style>
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-tx-bg text-tx-text min-h-screen`} style={{ backgroundColor: '#0a0b0d' }}>
        <WalletContextProvider>
          <AuthProvider>
            <AirdropSyncer />
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
        <SpeedInsights />
      </body>
    </html>
  );
}
