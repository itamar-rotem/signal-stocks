'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const TABS = [
  { path: '/signals', label: 'SIGNALS' },
  { path: '/watchlist', label: 'WATCHLIST' },
  { path: '/trades', label: 'TRADES' },
] as const;

export function SiteNav() {
  const pathname = usePathname();
  const isDemo = pathname.startsWith('/demo');
  const prefix = isDemo ? '/demo' : '/dashboard';

  return (
    <nav className="border-border border-b">
      <div className="mx-auto flex max-w-7xl gap-1 px-4">
        {TABS.map((tab) => {
          const href = prefix + tab.path;
          const active = pathname === href;
          return (
            <Link
              key={tab.path}
              href={href}
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
