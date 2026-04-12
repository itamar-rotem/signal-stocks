import { serverTrpc } from '@/trpc/server';
import { WatchlistContent } from './watchlist-content';

export const dynamic = 'force-dynamic';

export default async function WatchlistPage() {
  const trpc = await serverTrpc();
  const items = await trpc.watchlist.list();
  return <WatchlistContent initialItems={items} />;
}
