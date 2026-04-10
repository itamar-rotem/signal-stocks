import Link from 'next/link';
import { Button } from '@/components/ui/button';

export function Hero() {
  return (
    <section className="mx-auto max-w-4xl px-4 py-24 text-center">
      <h1 className="text-5xl font-bold tracking-tight sm:text-6xl">Your AI investing co-pilot</h1>
      <p className="text-muted-foreground mx-auto mt-6 max-w-2xl text-lg">
        SignalStocks scans the market every day, surfaces high-probability trade ideas, and tells
        you when to enter, hold, and exit &mdash; with AI-generated rationale for every move.
      </p>
      <div className="mt-10 flex items-center justify-center gap-4">
        <Link href="/sign-up">
          <Button size="lg">Get started</Button>
        </Link>
        <Link href="/performance">
          <Button size="lg" variant="outline">
            View performance
          </Button>
        </Link>
      </div>
    </section>
  );
}
