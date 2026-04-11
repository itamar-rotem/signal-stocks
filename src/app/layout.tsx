import type { Metadata } from 'next';
import { JetBrains_Mono } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import { Header } from '@/components/layout/header';
import { DisclaimerFooter } from '@/components/layout/disclaimer-footer';
import './globals.css';

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono-family',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Lodestar — AI investing co-pilot',
  description: 'Daily AI-scanned trade ideas with entry, exit, and rationale for every move.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <body
          className={`${mono.variable} bg-background flex min-h-screen flex-col font-sans antialiased`}
        >
          <Header />
          <div className="flex-1">{children}</div>
          <DisclaimerFooter />
        </body>
      </html>
    </ClerkProvider>
  );
}
