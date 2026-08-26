/**
 * Structured logging.
 *
 * Deliberately not a dependency (pino/winston/etc.) — Vercel already
 * captures everything written to stdout/stderr as a log line, and once a
 * line is valid JSON its log explorer (and any future log drain or
 * Sentry breadcrumb) can filter/search on the fields instead of grepping
 * message text. That's the entire value this file adds; "boring
 * technology a contractor could pick up" per `docs/ARCHITECTURE.md` L.7.
 *
 * `context` is for structured fields (orderId, jobType, ...), not prose —
 * put the human-readable part in `message`. Errors go through `err()` so
 * the stack trace and message are pulled out consistently rather than
 * however `String(error)` happens to stringify a given error shape.
 *
 * Use this in place of bare `console.log`/`console.error` in server code
 * going forward. It does not replace `recordAuditLog` — that's the
 * durable, queryable record of privileged actions; this is operational
 * visibility (what happened, for debugging and monitoring).
 *
 * `logger.error` also reports to Sentry (see `sentry.server.config.ts`)
 * — this is the one place that wiring lives, so call sites never need to
 * import Sentry directly. Safe to call even when Sentry has no DSN
 * configured: `captureException`/`captureMessage` no-op quietly when the
 * client is disabled, unlike the Stripe/Resend SDKs (CLAUDE.md gotcha 10).
 * `info`/`warn` stay plain structured console output only — routing every
 * warning to Sentry would bury real errors in noise.
 */

import * as Sentry from "@sentry/nextjs";

type LogLevel = "info" | "warn" | "error";

type LogContext = Record<string, unknown>;

function write(level: LogLevel, message: string, context?: LogContext): void {
  const line = {
    level,
    message,
    time: new Date().toISOString(),
    ...context,
  };

  const serialized = JSON.stringify(line);
  if (level === "error") {
    console.error(serialized);
  } else if (level === "warn") {
    console.warn(serialized);
  } else {
    console.log(serialized);
  }
}

/** Pulls a consistent `{ name, message, stack }` shape out of anything caught. */
export function err(error: unknown): { name: string; message: string; stack?: string } {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { name: "UnknownError", message: String(error) };
}

export const logger = {
  info(message: string, context?: LogContext): void {
    write("info", message, context);
  },
  warn(message: string, context?: LogContext): void {
    write("warn", message, context);
  },
  error(message: string, context?: LogContext): void {
    write("error", message, context);

    const errorInfo = context?.error as { name: string; message: string; stack?: string } | undefined;
    if (errorInfo && typeof errorInfo.message === "string") {
      const reconstructed = new Error(errorInfo.message);
      reconstructed.name = errorInfo.name;
      reconstructed.stack = errorInfo.stack;
      Sentry.captureException(reconstructed, { extra: context });
    } else {
      Sentry.captureMessage(message, { level: "error", extra: context });
    }
  },
};
