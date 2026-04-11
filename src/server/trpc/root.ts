import { router } from './trpc';
import { signalsRouter } from './routers/signals';

export const appRouter = router({
  signals: signalsRouter,
});

export type AppRouter = typeof appRouter;
