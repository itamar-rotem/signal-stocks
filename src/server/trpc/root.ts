import { router } from './trpc';
import { signalsRouter } from './routers/signals';
import { watchlistRouter } from './routers/watchlist';

export const appRouter = router({
  signals: signalsRouter,
  watchlist: watchlistRouter,
});

export type AppRouter = typeof appRouter;
