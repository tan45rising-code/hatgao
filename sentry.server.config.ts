/**
 * Sentry init for the Node.js server runtime (API routes, Server
 * Actions, Server Components). Loaded by `src/instrumentation.ts`.
 *
 * Safe to run even when `SENTRY_DSN` is unset — Sentry.init() with an
 * empty/undefined dsn disables the client instead of throwing, unlike
 * the Stripe/Resend SDKs (see CLAUDE.md gotcha 10). No lazy-construction
 * proxy needed here; this really can sit at module scope.
 */
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,

  // A single-location restaurant doesn't need performance tracing yet —
  // 0 keeps the (likely free-tier) Sentry quota spent on real errors,
  // not spans. Revisit if request-latency debugging becomes useful.
  tracesSampleRate: 0,
});
