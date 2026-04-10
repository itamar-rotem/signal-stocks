import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { Header } from '@/components/layout/header';
import { DisclaimerFooter } from '@/components/layout/disclaimer-footer';
import './globals.css';

export const metadata: Metadata = {
  title: 'SignalStocks',
  description: 'AI-Powered Stock Screener & Active Investing Companion',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <body className="bg-background flex min-h-screen flex-col font-sans antialiased">
          <Header />
          <div className="flex-1">{children}</div>
          <DisclaimerFooter />
        </body>
      </html>
    </ClerkProvider>
  );
}
