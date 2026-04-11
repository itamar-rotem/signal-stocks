const LABELS: Record<string, string> = {
  'SIG-01': 'MA200 Approaching',
  'SIG-02': 'MA200 Breakout',
  'SIG-03': 'MA150 Approaching',
  'SIG-04': 'MA150 Breakout',
  'SIG-05': 'Dual MA Breakout',
  'SIG-06': 'Golden Cross',
  'SIG-07': 'Support Bounce',
};

export function signalTypeLabel(code: string): string {
  return LABELS[code] ?? code;
}
