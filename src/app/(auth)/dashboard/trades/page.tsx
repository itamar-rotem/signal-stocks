import { serverTrpc } from '@/trpc/server';
import { TradesContent } from './trades-content';

export const dynamic = 'force-dynamic';

export default async function TradesPage() {
  const trpc = await serverTrpc();
  const trades = await trpc.trades.list();
  return <TradesContent initialTrades={trades} />;
}
