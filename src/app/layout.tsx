import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';

export const metadata: Metadata = {
  title: 'SignalStocks',
  description: 'AI-Powered Stock Screener & Active Investing Companion',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <body className="bg-background min-h-screen font-sans antialiased">{children}</body>
      </html>
    </ClerkProvider>
  );
}
