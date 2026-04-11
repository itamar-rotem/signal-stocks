import '@testing-library/jest-dom/vitest';

// Provide stub env vars so modules that import db/env don't throw during tests
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://test:test@localhost/test';
process.env.CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY ?? 'test_clerk_secret_key';
process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? 'pk_test_placeholder';
