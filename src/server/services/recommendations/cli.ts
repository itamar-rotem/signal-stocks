import { evaluateAllActiveSignals } from './ingestion';

async function main() {
  console.log('Evaluating all active signal recommendations...');
  const summary = await evaluateAllActiveSignals();

  console.log('\n=== Recommendation Summary ===');
  console.log(`Processed:   ${summary.processed}`);
  console.log(`Created:     ${summary.created}`);
  console.log(`Transitions: ${summary.transitions}`);
  console.log(`Unchanged:   ${summary.unchanged}`);
  if (summary.errors.length > 0) {
    console.log(`\nErrors: ${summary.errors.length}`);
    for (const e of summary.errors) {
      console.log(`  signal=${e.signalId} → ${e.error}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Recommendation evaluation failed:', err);
    process.exit(1);
  });
