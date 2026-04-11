'use client';

import Link from 'next/link';
import { useAuth, UserButton } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/brand/logo';

export function Header() {
  const { isSignedIn } = useAuth();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        <Link
          href="/"
          className="flex items-center gap-2 font-mono text-sm font-bold tracking-widest uppercase"
        >
          <Logo size="md" />
          <span>LODESTAR</span>
        </Link>
        <nav className="flex items-center gap-3">
          {!isSignedIn ? (
            <>
              <Link href="/sign-in">
                <Button
                  variant="ghost"
                  size="sm"
                  className="font-mono text-xs uppercase tracking-wider"
                >
                  Sign in
                </Button>
              </Link>
              <Link href="/sign-up">
                <Button
                  size="sm"
                  className="font-mono text-xs uppercase tracking-wider"
                >
                  Sign up
                </Button>
              </Link>
            </>
          ) : (
            <>
              <Link href="/dashboard">
                <Button
                  variant="ghost"
                  size="sm"
                  className="font-mono text-xs uppercase tracking-wider"
                >
                  Dashboard
                </Button>
              </Link>
              <UserButton />
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
