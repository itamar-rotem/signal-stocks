import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/brand/logo';

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Grid background layer */}
      <div
        aria-hidden
        className="bg-grid bg-grid-fade pointer-events-none absolute inset-0 -z-20"
      />
      {/* Ambient background gradient */}
      <div
        aria-hidden
        className="animate-ambient pointer-events-none absolute inset-0 -z-10 opacity-50 blur-3xl"
        style={{
          background:
            'radial-gradient(60% 60% at 30% 30%, rgba(16,185,129,0.25), transparent 70%), radial-gradient(50% 50% at 70% 60%, rgba(34,211,238,0.2), transparent 70%)',
        }}
      />
      <div className="mx-auto flex max-w-4xl flex-col items-center px-4 py-24 text-center">
        {/* Live badge */}
        <div className="animate-fade-up mb-4 font-mono text-xs tracking-widest text-cyan-400">
          &#9679; MARKET OPS &middot; LIVE
        </div>
        <Logo size="xl" animated />
        <h1
          className="animate-fade-up mt-8 text-5xl font-bold tracking-tight sm:text-6xl"
          style={{ animationDelay: '0.3s' }}
        >
          Find your{' '}
          <span className="bg-gradient-to-r from-emerald-400 via-cyan-400 to-sky-400 bg-clip-text text-transparent">
            lodestar
          </span>{' '}
          in the market.
        </h1>
        <p
          className="animate-fade-up text-muted-foreground mx-auto mt-6 max-w-2xl text-lg"
          style={{ animationDelay: '0.55s' }}
        >
          Lodestar scans the market every day, surfaces high-probability trade ideas, and tells you
          when to enter, hold, and exit — with AI-generated rationale for every move.
        </p>
        <div
          className="animate-fade-up mt-10 flex items-center justify-center gap-4"
          style={{ animationDelay: '0.8s' }}
        >
          <Link href="/demo">
            <Button
              size="lg"
              className="bg-primary text-primary-foreground hover:bg-primary/90 font-mono"
            >
              Try the demo
            </Button>
          </Link>
          <Link href="/sign-up">
            <Button
              size="lg"
              variant="outline"
              className="border-primary text-primary hover:bg-primary/10 font-mono"
            >
              Sign up
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
