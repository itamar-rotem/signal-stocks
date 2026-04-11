'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/dashboard/signals', label: 'SIGNALS' },
  { href: '/dashboard/watchlist', label: 'WATCHLIST' },
  { href: '/dashboard/trades', label: 'TRADES' },
] as const;

export function SiteNav() {
  const pathname = usePathname();
  return (
    <nav className="border-border border-b">
      <div className="mx-auto flex max-w-7xl gap-1 px-4">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'border-b-2 px-3 py-2.5 font-mono text-[11px] tracking-widest uppercase transition-colors',
                active
                  ? 'border-primary text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:border-primary/40 border-transparent',
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
