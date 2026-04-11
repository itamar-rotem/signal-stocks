import { DemoBanner } from '@/components/demo/demo-banner';
import { SiteNav } from '@/components/layout/site-nav';

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <DemoBanner />
      <SiteNav />
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
    </>
  );
}
