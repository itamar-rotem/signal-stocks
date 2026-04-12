import { PLATFORM_STATS, PLATFORM_SUMMARY } from '@/lib/simulator/platform-stats';
import { PerformanceDashboard } from './performance-dashboard';

export const metadata = {
  title: 'Lodestar — Platform Performance',
  description: 'Historical performance of Lodestar AI signals — simulated results.',
};

export default function PerformancePage() {
  return <PerformanceDashboard stats={PLATFORM_STATS} summary={PLATFORM_SUMMARY} />;
}
