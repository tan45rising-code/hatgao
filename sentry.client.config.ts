/**
 * Sentry init for the browser (customer site + admin dashboard). Loaded
 * automatically by the webpack plugin `withSentryConfig` sets up in
 * `next.config.ts` — nothing else needs to import this file.
 */
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: 0,
});
