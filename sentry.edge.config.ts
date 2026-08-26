/**
 * Sentry init for the Edge runtime (middleware, and any route explicitly
 * opted into `runtime = "edge"` — none currently are, but `src/middleware.ts`
 * itself runs here). Loaded by `src/instrumentation.ts`. Same reasoning
 * as `sentry.server.config.ts` on why this is safe with no DSN set.
 */
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: 0,
});
