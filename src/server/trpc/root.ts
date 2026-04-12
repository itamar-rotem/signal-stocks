import { router } from './trpc';
import { signalsRouter } from './routers/signals';
import { watchlistRouter } from './routers/watchlist';
import { tradesRouter } from './routers/trades';

export const appRouter = router({
  signals: signalsRouter,
  watchlist: watchlistRouter,
  trades: tradesRouter,
});

export type AppRouter = typeof appRouter;
