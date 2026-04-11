import { SiteNav } from '@/components/layout/site-nav';
import { TRPCProvider } from '@/trpc/client';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <TRPCProvider>
      <SiteNav />
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
    </TRPCProvider>
  );
}
