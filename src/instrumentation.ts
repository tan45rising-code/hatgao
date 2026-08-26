/**
 * Next.js instrumentation hook — runs once per runtime when the server
 * starts. This is where Sentry actually gets initialized; the
 * `sentry.*.config.ts` files at the project root (not `src/`, because
 * that's the layout `withSentryConfig` and the Sentry CLI expect) hold
 * the real `Sentry.init(...)` calls, one per runtime, since Node and
 * Edge support different things.
 *
 * `onRequestError` hands Next's own request-lifecycle errors (thrown in
 * Server Components, Route Handlers, etc.) to Sentry — without this,
 * only errors that flow through `logger.error()` would be reported.
 */
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
