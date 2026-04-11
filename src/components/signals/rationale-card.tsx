import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface RationaleCardProps {
  summary: string;
  fundamentalThesis: string | null;
  technicalContext: string | null;
  strategyNote: string | null;
  confidence: string | null;
  disclaimer: string;
}

export function RationaleCard(props: RationaleCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>AI Rationale</CardTitle>
          {props.confidence && (
            <Badge variant="outline">Confidence: {props.confidence}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <Section label="Summary">{props.summary}</Section>
        {props.fundamentalThesis && (
          <Section label="Fundamental thesis">{props.fundamentalThesis}</Section>
        )}
        {props.technicalContext && (
          <Section label="Technical context">{props.technicalContext}</Section>
        )}
        {props.strategyNote && (
          <Section label="Strategy note">{props.strategyNote}</Section>
        )}
        <p className="text-muted-foreground border-t pt-3 text-xs italic">
          {props.disclaimer}
        </p>
      </CardContent>
    </Card>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-muted-foreground text-xs font-medium uppercase">
        {label}
      </div>
      <div className="mt-1 whitespace-pre-line">{children}</div>
    </div>
  );
}
