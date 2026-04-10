import { SiteNav } from '@/components/layout/site-nav';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function DashboardPage() {
  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-7xl px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Today&rsquo;s Signals</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              No signals yet. The signal engine will populate this view in a later phase.
            </p>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
