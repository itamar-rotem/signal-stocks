import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RecommendationStateBadge } from './recommendation-state-badge';
import { signalTypeLabel } from './signal-type-label';

interface SignalCardProps {
  ticker: string;
  name: string;
  sector: string | null;
  signalType: string;
  strength: string;
  volumeConfirmed: boolean;
  signalScore: number | null;
  fundamentalScore: number | null;
  lastPrice: number | null;
  targetPrice: number | null;
  stopLoss: number | null;
  state: string | null;
  triggeredAt: Date;
}

function fmtPrice(n: number | null): string {
  if (n === null) return '—';
  return `$${n.toFixed(2)}`;
}

function fmtScore(n: number | null): string {
  if (n === null) return '—';
  return n.toFixed(0);
}

export function SignalCard(props: SignalCardProps) {
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-lg">{props.ticker}</CardTitle>
            <p className="text-muted-foreground text-xs">{props.name}</p>
            {props.sector && <p className="text-muted-foreground text-xs">{props.sector}</p>}
          </div>
          <RecommendationStateBadge state={props.state} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{signalTypeLabel(props.signalType)}</Badge>
          <Badge variant={props.strength === 'very_strong' ? 'success' : 'secondary'}>
            {props.strength.replace('_', ' ')}
          </Badge>
          {props.volumeConfirmed && <Badge variant="info">Volume ✓</Badge>}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Signal score" value={fmtScore(props.signalScore)} />
          <Stat label="Fundamentals" value={fmtScore(props.fundamentalScore)} />
          <Stat label="Last price" value={fmtPrice(props.lastPrice)} />
          <Stat label="Target" value={fmtPrice(props.targetPrice)} />
          <Stat label="Stop" value={fmtPrice(props.stopLoss)} />
          <Stat label="Triggered" value={props.triggeredAt.toISOString().slice(0, 10)} />
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
