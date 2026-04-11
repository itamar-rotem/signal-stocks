import 'server-only';
import { cache } from 'react';
import { createContext } from '@/server/trpc/context';
import { appRouter } from '@/server/trpc/root';

const getServerContext = cache(() => createContext());

export const serverTrpc = cache(async () => {
  const ctx = await getServerContext();
  return appRouter.createCaller(ctx);
});
