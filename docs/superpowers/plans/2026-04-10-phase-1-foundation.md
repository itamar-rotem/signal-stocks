# SignalStocks — Phase 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up the Next.js project foundation with TypeScript, Tailwind, shadcn/ui, Clerk authentication, Neon PostgreSQL + Drizzle ORM, the basic layout shell with legal disclaimer footer, and a deployable skeleton.

**Architecture:** Single Next.js 14+ App Router monolith. All code in `src/`. Auth-protected routes under `(auth)` route group. Database schema lives in `src/server/db/`. UI primitives from shadcn/ui. The result is a deployable skeleton app where users can sign up/in and see an empty dashboard.

**Tech Stack:** Next.js 14+, TypeScript, Tailwind CSS, shadcn/ui, Clerk, Neon PostgreSQL, Drizzle ORM, Vitest.

---

## Prerequisites (Must Be Done Before Starting)

The implementer needs the following accounts/keys set up outside the code:

1. **Neon account** (https://neon.tech) — create a free database, copy the connection string
2. **Clerk account** (https://clerk.com) — create an application, copy publishable key and secret key
3. **Node.js 20+** installed
4. **pnpm** installed (`npm install -g pnpm`)

These keys will go into `.env.local`. Do NOT commit `.env.local`.

---

## File Structure

Files created in this phase:

```
signal-stocks/
├── .env.example              # Template for required env vars
├── .eslintrc.json            # ESLint config
├── .prettierrc               # Prettier config
├── next.config.mjs           # Next.js config
├── package.json              # Dependencies
├── tsconfig.json             # TypeScript config
├── tailwind.config.ts        # Tailwind config
├── postcss.config.js         # PostCSS config
├── drizzle.config.ts         # Drizzle Kit config
├── vitest.config.ts          # Vitest config
├── components.json           # shadcn/ui config
├── middleware.ts             # Clerk auth middleware
├── CLAUDE.md                 # Claude Code project context
└── src/
    ├── app/
    │   ├── layout.tsx                    # Root layout with ClerkProvider, disclaimer footer
    │   ├── page.tsx                      # Landing page (public)
    │   ├── globals.css                   # Tailwind base styles
    │   ├── (auth)/
    │   │   └── dashboard/
    │   │       └── page.tsx              # Dashboard shell (auth-protected)
    │   ├── sign-in/[[...sign-in]]/
    │   │   └── page.tsx                  # Clerk sign-in
    │   └── sign-up/[[...sign-up]]/
    │       └── page.tsx                  # Clerk sign-up
    ├── components/
    │   ├── ui/                           # shadcn/ui primitives (button, card)
    │   ├── layout/
    │   │   ├── disclaimer-footer.tsx     # Non-dismissible legal footer
    │   │   ├── header.tsx                # Top nav with Clerk UserButton
    │   │   └── site-nav.tsx              # Dashboard nav tabs
    │   └── landing/
    │       └── hero.tsx                  # Landing hero section
    ├── server/
    │   └── db/
    │       ├── index.ts                  # Drizzle client
    │       └── schema.ts                 # Empty stub for Phase 2
    └── lib/
        ├── utils.ts                      # cn() helper for Tailwind
        └── env.ts                        # Env var validation
```

Each file has one clear responsibility. Business logic tables come in Phase 2.

---

## Task 1: Initialize Next.js Project

**Files:**

- Create: `signal-stocks/package.json`
- Create: `signal-stocks/tsconfig.json`
- Create: `signal-stocks/next.config.mjs`
- Create: `signal-stocks/src/app/layout.tsx`
- Create: `signal-stocks/src/app/page.tsx`
- Create: `signal-stocks/src/app/globals.css`

- [ ] **Step 1: Run the Next.js installer**

From the `signal-stocks/` directory (already a git repo with README/spec/plan):

```bash
pnpm create next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-pnpm --no-turbopack
```

When prompted to overwrite `README.md`, `.gitignore`, or any existing file: **say No**. The installer will fill in everything else.

- [ ] **Step 2: Verify the dev server starts**

```bash
pnpm dev
```

Expected: Next.js dev server starts on http://localhost:3000 and shows the default Next.js welcome page. Press Ctrl+C to stop.

- [ ] **Step 3: Pin Node engines in package.json**

Edit `package.json` — add an `engines` field at the top level:

```json
"engines": {
  "node": ">=20.0.0",
  "pnpm": ">=9.0.0"
}
```

- [ ] **Step 4: Replace `src/app/page.tsx` with a minimal landing placeholder**

```tsx
export default function HomePage() {
  return (
    <main className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold tracking-tight">SignalStocks</h1>
      <p className="text-muted-foreground mt-4 max-w-xl text-center">
        AI-Powered Stock Screener & Active Investing Companion.
      </p>
    </main>
  );
}
```

- [ ] **Step 5: Verify the new landing page renders**

```bash
pnpm dev
```

Expected: http://localhost:3000 shows "SignalStocks" heading and the subtitle. Stop with Ctrl+C.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Initialize Next.js project with TypeScript and Tailwind"
```

---

## Task 2: Install and Configure Prettier

**Files:**

- Create: `.prettierrc`
- Create: `.prettierignore`
- Modify: `package.json` (add format scripts)

- [ ] **Step 1: Install Prettier and the Tailwind plugin**

```bash
pnpm add -D prettier prettier-plugin-tailwindcss
```

- [ ] **Step 2: Create `.prettierrc`**

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "plugins": ["prettier-plugin-tailwindcss"]
}
```

- [ ] **Step 3: Create `.prettierignore`**

```
node_modules
.next
dist
build
drizzle/meta
pnpm-lock.yaml
```

- [ ] **Step 4: Add format scripts to `package.json`**

Add to the `"scripts"` section:

```json
"format": "prettier --write .",
"format:check": "prettier --check ."
```

- [ ] **Step 5: Run formatter**

```bash
pnpm format
```

Expected: Prettier rewrites all JS/TS/JSON/CSS files in place. No errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add Prettier with Tailwind plugin"
```

---

## Task 3: Install and Configure shadcn/ui

**Files:**

- Create: `components.json`
- Create: `src/lib/utils.ts`
- Create: `src/components/ui/button.tsx` (via shadcn add)
- Create: `src/components/ui/card.tsx` (via shadcn add)

- [ ] **Step 1: Run the shadcn/ui init**

```bash
pnpm dlx shadcn@latest init
```

Answer the prompts:

- Style: **New York**
- Base color: **Slate**
- CSS variables: **Yes**

This creates `components.json`, updates `src/app/globals.css` with CSS variables, and creates `src/lib/utils.ts` with the `cn()` helper.

- [ ] **Step 2: Add the Button and Card primitives**

```bash
pnpm dlx shadcn@latest add button card
```

Expected: creates `src/components/ui/button.tsx` and `src/components/ui/card.tsx`.

- [ ] **Step 3: Verify `cn()` utility exists**

Open `src/lib/utils.ts`. It should contain:

```ts
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

If missing, create the file above and run `pnpm add clsx tailwind-merge`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Add shadcn/ui with Button and Card primitives"
```

---

## Task 4: Add Environment Variable Validation

**Files:**

- Create: `.env.example`
- Create: `src/lib/env.ts`

- [ ] **Step 1: Install the env validator**

```bash
pnpm add @t3-oss/env-nextjs zod
```

- [ ] **Step 2: Create `.env.example`**

```
# Neon PostgreSQL
DATABASE_URL="postgresql://user:password@host/db?sslmode=require"

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=""
CLERK_SECRET_KEY=""
NEXT_PUBLIC_CLERK_SIGN_IN_URL="/sign-in"
NEXT_PUBLIC_CLERK_SIGN_UP_URL="/sign-up"
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL="/dashboard"
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL="/dashboard"
```

- [ ] **Step 3: Create `src/lib/env.ts`**

```ts
import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    CLERK_SECRET_KEY: z.string().min(1),
  },
  client: {
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
    NEXT_PUBLIC_CLERK_SIGN_IN_URL: z.string().default('/sign-in'),
    NEXT_PUBLIC_CLERK_SIGN_UP_URL: z.string().default('/sign-up'),
    NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL: z.string().default('/dashboard'),
    NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL: z.string().default('/dashboard'),
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    NEXT_PUBLIC_CLERK_SIGN_IN_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL,
    NEXT_PUBLIC_CLERK_SIGN_UP_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL,
    NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL:
      process.env.NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL,
    NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL:
      process.env.NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL,
  },
  emptyStringAsUndefined: true,
});
```

- [ ] **Step 4: Create the local `.env.local`**

Create `.env.local` (already gitignored) by copying `.env.example` and filling in real Neon + Clerk values from the prerequisite accounts.

```bash
cp .env.example .env.local
```

Then open `.env.local` and fill in the actual values.

- [ ] **Step 5: Commit**

```bash
git add .env.example src/lib/env.ts package.json pnpm-lock.yaml
git commit -m "Add typed environment variable validation"
```

---

## Task 5: Install and Configure Clerk

**Files:**

- Modify: `package.json`
- Create: `middleware.ts`
- Modify: `src/app/layout.tsx`
- Create: `src/app/sign-in/[[...sign-in]]/page.tsx`
- Create: `src/app/sign-up/[[...sign-up]]/page.tsx`

- [ ] **Step 1: Install Clerk**

```bash
pnpm add @clerk/nextjs
```

- [ ] **Step 2: Create `middleware.ts` at the project root**

```ts
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isProtectedRoute = createRouteMatcher(['/dashboard(.*)']);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
```

- [ ] **Step 3: Replace `src/app/layout.tsx` with Clerk-wrapped layout**

```tsx
import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';

export const metadata: Metadata = {
  title: 'SignalStocks',
  description: 'AI-Powered Stock Screener & Active Investing Companion',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <body className="bg-background min-h-screen font-sans antialiased">{children}</body>
      </html>
    </ClerkProvider>
  );
}
```

- [ ] **Step 4: Create the sign-in page**

Create `src/app/sign-in/[[...sign-in]]/page.tsx`:

```tsx
import { SignIn } from '@clerk/nextjs';

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <SignIn />
    </div>
  );
}
```

- [ ] **Step 5: Create the sign-up page**

Create `src/app/sign-up/[[...sign-up]]/page.tsx`:

```tsx
import { SignUp } from '@clerk/nextjs';

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <SignUp />
    </div>
  );
}
```

- [ ] **Step 6: Verify Clerk routes work**

```bash
pnpm dev
```

Visit http://localhost:3000/sign-in and http://localhost:3000/sign-up. Both should render Clerk's hosted UI. Visit http://localhost:3000/dashboard while signed out — it should redirect to /sign-in. Stop with Ctrl+C.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Add Clerk authentication with sign-in/up routes and middleware"
```

---

## Task 6: Install Drizzle ORM and Neon Client

**Files:**

- Modify: `package.json`
- Create: `drizzle.config.ts`
- Create: `src/server/db/index.ts`
- Create: `src/server/db/schema.ts`

- [ ] **Step 1: Install Drizzle and Neon serverless driver**

```bash
pnpm add drizzle-orm @neondatabase/serverless
pnpm add -D drizzle-kit
```

- [ ] **Step 2: Create `drizzle.config.ts`**

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/server/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
});
```

- [ ] **Step 3: Create the Drizzle client at `src/server/db/index.ts`**

```ts
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { env } from '@/lib/env';
import * as schema from './schema';

const sql = neon(env.DATABASE_URL);

export const db = drizzle(sql, { schema });
```

- [ ] **Step 4: Create an empty schema stub at `src/server/db/schema.ts`**

```ts
// Drizzle table definitions live here. Populated in Phase 2.
// Empty stub required so the client compiles in Phase 1.
export {};
```

- [ ] **Step 5: Add Drizzle scripts to `package.json`**

Add to `"scripts"`:

```json
"db:generate": "drizzle-kit generate",
"db:push": "drizzle-kit push",
"db:studio": "drizzle-kit studio"
```

- [ ] **Step 6: Verify the project still builds**

```bash
pnpm build
```

Expected: build succeeds. If it fails due to missing `DATABASE_URL`, make sure `.env.local` has a valid Neon connection string.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Add Drizzle ORM with Neon serverless client"
```

---

## Task 7: Build the Disclaimer Footer Component

**Files:**

- Create: `src/components/layout/disclaimer-footer.tsx`
- Create: `src/components/layout/disclaimer-footer.test.tsx`

- [ ] **Step 1: Install testing dependencies**

```bash
pnpm add -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom jsdom
```

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

- [ ] **Step 3: Create `vitest.setup.ts`**

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 4: Add test script to `package.json`**

Add to `"scripts"`:

```json
"test": "vitest",
"test:run": "vitest run"
```

- [ ] **Step 5: Write the failing test**

Create `src/components/layout/disclaimer-footer.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { DisclaimerFooter } from './disclaimer-footer';

describe('DisclaimerFooter', () => {
  it('renders the legal disclaimer text', () => {
    render(<DisclaimerFooter />);
    expect(screen.getByText(/educational information only/i)).toBeInTheDocument();
    expect(screen.getByText(/not financial advice/i)).toBeInTheDocument();
  });

  it('has role="contentinfo" for accessibility', () => {
    render(<DisclaimerFooter />);
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

```bash
pnpm test:run src/components/layout/disclaimer-footer.test.tsx
```

Expected: test fails because `DisclaimerFooter` does not exist yet.

- [ ] **Step 7: Implement `DisclaimerFooter`**

Create `src/components/layout/disclaimer-footer.tsx`:

```tsx
export function DisclaimerFooter() {
  return (
    <footer
      role="contentinfo"
      className="bg-muted/50 text-muted-foreground border-t px-4 py-3 text-center text-xs"
    >
      SignalStocks provides educational information only. Not financial advice. Not a recommendation
      to buy or sell securities. Past performance does not guarantee future results.
    </footer>
  );
}
```

- [ ] **Step 8: Run the test to verify it passes**

```bash
pnpm test:run src/components/layout/disclaimer-footer.test.tsx
```

Expected: both tests pass.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "Add non-dismissible legal disclaimer footer with tests"
```

---

## Task 8: Build the Header with Clerk UserButton

**Files:**

- Create: `src/components/layout/header.tsx`

- [ ] **Step 1: Create the header component**

Create `src/components/layout/header.tsx`:

```tsx
import Link from 'next/link';
import { SignedIn, SignedOut, UserButton } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';

export function Header() {
  return (
    <header className="border-b">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        <Link href="/" className="text-lg font-bold tracking-tight">
          SignalStocks
        </Link>
        <nav className="flex items-center gap-4">
          <SignedOut>
            <Button asChild variant="ghost" size="sm">
              <Link href="/sign-in">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/sign-up">Sign up</Link>
            </Button>
          </SignedOut>
          <SignedIn>
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard">Dashboard</Link>
            </Button>
            <UserButton afterSignOutUrl="/" />
          </SignedIn>
        </nav>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/layout/header.tsx
git commit -m "Add Header component with Clerk UserButton"
```

---

## Task 9: Wire Header and Footer into Root Layout

**Files:**

- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Update root layout to include Header and DisclaimerFooter**

Replace `src/app/layout.tsx`:

```tsx
import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { Header } from '@/components/layout/header';
import { DisclaimerFooter } from '@/components/layout/disclaimer-footer';
import './globals.css';

export const metadata: Metadata = {
  title: 'SignalStocks',
  description: 'AI-Powered Stock Screener & Active Investing Companion',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <body className="bg-background flex min-h-screen flex-col font-sans antialiased">
          <Header />
          <div className="flex-1">{children}</div>
          <DisclaimerFooter />
        </body>
      </html>
    </ClerkProvider>
  );
}
```

- [ ] **Step 2: Verify the layout renders correctly**

```bash
pnpm dev
```

Visit http://localhost:3000. You should see:

- Header at top with "SignalStocks" brand link and Sign in/Sign up buttons
- Landing page content in the middle
- Legal disclaimer footer at the bottom

Stop with Ctrl+C.

- [ ] **Step 3: Commit**

```bash
git add src/app/layout.tsx
git commit -m "Wire Header and DisclaimerFooter into root layout"
```

---

## Task 10: Build the Protected Dashboard Shell

**Files:**

- Create: `src/app/(auth)/dashboard/page.tsx`
- Create: `src/components/layout/site-nav.tsx`

- [ ] **Step 1: Create the dashboard nav tabs**

Create `src/components/layout/site-nav.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/dashboard', label: 'Signals' },
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
```

- [ ] **Step 2: Create the dashboard page**

Create `src/app/(auth)/dashboard/page.tsx`:

```tsx
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
```

- [ ] **Step 3: Verify the protected route works**

```bash
pnpm dev
```

Visit http://localhost:3000/dashboard. If signed out, you should be redirected to Clerk's sign-in page. After signing in, you should land on the dashboard and see the nav tabs plus the "Today's Signals" empty card. Stop with Ctrl+C.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Add protected dashboard shell with nav tabs"
```

---

## Task 11: Enhance the Landing Page Hero

**Files:**

- Create: `src/components/landing/hero.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Create the hero component**

Create `src/components/landing/hero.tsx`:

```tsx
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
        <Button asChild size="lg">
          <Link href="/sign-up">Get started</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/performance">View performance</Link>
        </Button>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Update the landing page to use Hero**

Replace `src/app/page.tsx`:

```tsx
import { Hero } from '@/components/landing/hero';

export default function HomePage() {
  return (
    <main>
      <Hero />
    </main>
  );
}
```

- [ ] **Step 3: Verify the landing page renders**

```bash
pnpm dev
```

Visit http://localhost:3000. You should see the hero with the headline, subtitle, and two buttons. Stop with Ctrl+C.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Add landing hero section"
```

---

## Task 12: Create CLAUDE.md for Project Context

**Files:**

- Create: `CLAUDE.md`

- [ ] **Step 1: Create `CLAUDE.md` at the project root**

```markdown
# SignalStocks

AI-Powered Stock Screener & Active Investing Companion.

## Tech Stack

- Next.js 14+ (App Router) + TypeScript
- Tailwind CSS + shadcn/ui
- tRPC v11 (added in a later phase)
- Neon PostgreSQL + Drizzle ORM
- Clerk authentication
- Lightweight Charts (TradingView OSS) for financial charts
- Anthropic Claude API (Sonnet) for AI rationale
- Financial Modeling Prep (FMP) for market data
- Inngest for the daily pipeline
- Resend for email alerts
- Vercel for hosting

## Project Structure
```

src/
app/ Next.js App Router (pages, layouts)
(auth)/ Clerk-protected routes
api/ API routes + tRPC handler
server/
db/ Drizzle schema, client
trpc/ tRPC routers (later)
services/ Business logic (signals, scoring, AI, alerts)
inngest/ Pipeline step functions
components/ React components (UI, charts, cards)
lib/ Shared utilities, constants, env validation

````

## Design Spec

See `docs/superpowers/specs/2026-04-10-signalstocks-design.md` for the full design.

## Build Phases

See `docs/superpowers/plans/` for per-phase implementation plans.

## Conventions

- TypeScript strict mode
- Path alias `@/*` → `src/*`
- Tests co-located with source: `foo.ts` + `foo.test.ts`
- Prettier formatting (run `pnpm format`)
- Environment variables validated via `src/lib/env.ts`
- Legal disclaimers are non-dismissible per PRD Section 18

## Running Locally

```bash
pnpm install
pnpm dev              # http://localhost:3000
pnpm test             # run Vitest in watch mode
pnpm test:run         # run Vitest once
pnpm build            # production build
pnpm db:push          # apply Drizzle schema to Neon
pnpm db:studio        # open Drizzle Studio
````

## Notes for Claude Code

- Full features first, paywall later (Stripe deferred)
- Email alerts only initially (push/SMS/Telegram are post-launch)
- Real FMP data from day one — no mock data
- Legal disclaimers and non-advisory framing are hard requirements

````

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "Add CLAUDE.md for project context"
````

---

## Task 13: Add CI-Friendly Scripts and Verify Clean Build

**Files:**

- Modify: `package.json`

- [ ] **Step 1: Verify the full build passes**

```bash
pnpm format:check
```

Expected: no formatting errors. If errors, run `pnpm format` and commit.

```bash
pnpm lint
```

Expected: no ESLint errors.

```bash
pnpm test:run
```

Expected: all tests pass.

```bash
pnpm build
```

Expected: Next.js build succeeds with no errors.

- [ ] **Step 2: If any step failed, fix the issue before proceeding**

The foundation is not complete until all four commands pass cleanly.

- [ ] **Step 3: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "Ensure clean Phase 1 build: lint, format, test, build all passing"
```

---

## Task 14: Push to GitHub

- [ ] **Step 1: Push the branch**

```bash
git push origin main
```

Expected: all Phase 1 commits pushed to `itamar-rotem/signal-stocks` on GitHub.

- [ ] **Step 2: Verify on GitHub**

Visit https://github.com/itamar-rotem/signal-stocks and confirm the repository shows the new files (src/, package.json, CLAUDE.md, etc.).

---

## Phase 1 Completion Criteria

Phase 1 is complete when ALL of the following are true:

- [ ] `pnpm dev` starts the Next.js dev server without errors
- [ ] http://localhost:3000 shows the landing page with header, hero, and disclaimer footer
- [ ] http://localhost:3000/sign-up creates a new Clerk user successfully
- [ ] http://localhost:3000/dashboard redirects to sign-in when signed out
- [ ] After signing in, the dashboard renders with nav tabs and an empty signals card
- [ ] `pnpm format:check` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test:run` passes (disclaimer footer tests)
- [ ] `pnpm build` completes without errors
- [ ] Neon `DATABASE_URL` validates via `src/lib/env.ts` (app starts without env errors)
- [ ] All commits pushed to `main` on GitHub

Once all checks pass, Phase 2 (Database Schema) can begin.
