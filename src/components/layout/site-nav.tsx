'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/dashboard/signals', label: 'Signals' },
  { href: '/dashboard/watchlist', label: 'Watchlist' },
  { href: '/dashboard/trades', label: 'Trades' },
] as const;

export function SiteNav() {
  const pathname = usePathname();
  return (
    <nav className="border-b">
      <div className="mx-auto flex max-w-7xl gap-6 px-4">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'border-b-2 px-1 py-3 text-sm font-medium transition-colors',
                active
                  ? 'border-primary text-foreground'
                  : 'text-muted-foreground hover:text-foreground border-transparent',
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
