import { cn } from '@/lib/utils';

interface RationaleCardProps {
  summary: string;
  fundamentalThesis: string | null;
  technicalContext: string | null;
  strategyNote: string | null;
  confidence: string | null;
  disclaimer: string;
  className?: string;
}

export function RationaleCard(props: RationaleCardProps) {
  return (
    <div className={cn('space-y-4 text-sm', props.className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
          AI Rationale
        </span>
        {props.confidence && (
          <span className="inline-flex items-center rounded-sm border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
            Confidence: {props.confidence}
          </span>
        )}
      </div>
      <Section label="Summary">{props.summary}</Section>
      {props.fundamentalThesis && (
        <Section label="Fundamental thesis">{props.fundamentalThesis}</Section>
      )}
      {props.technicalContext && (
        <Section label="Technical context">{props.technicalContext}</Section>
      )}
      {props.strategyNote && <Section label="Strategy note">{props.strategyNote}</Section>}
      <p className="border-t border-border pt-3 text-xs italic text-muted-foreground">
        {props.disclaimer}
      </p>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60">
        {label}
      </div>
      <div className="mt-1 whitespace-pre-line">{children}</div>
    </div>
  );
}
