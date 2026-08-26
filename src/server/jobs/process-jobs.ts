/**
 * The job queue worker. Called from
 * `src/app/api/internal/jobs/tick/route.ts` on a schedule (Vercel Cron)
 * rather than running as a long-lived process — there's no long-lived
 * process available on Vercel's serverless functions, so "the worker" is
 * really "a batch of jobs processed per invocation."
 *
 * Claiming a job is a single conditional `UPDATE ... WHERE status =
 * 'PENDING'` (via `updateMany` so we get a row count back), not a
 * read-then-write — the same "let the database's current state be the
 * guard, not a separate check" principle `docs/ARCHITECTURE.md` calls
 * for around price-change races. Cron invocations shouldn't normally
 * overlap, but this keeps a double-fire (a slow tick still running when
 * the next one starts) from double-sending an email instead of quietly
 * losing the race.
 */

import { prisma } from "@/server/db";
import { jobHandlers } from "@/server/jobs/handlers";
import type { JobType } from "@/server/jobs/types";
import { nextRunAfter } from "@/server/jobs/backoff";
import { logger, err } from "@/server/logging/logger";
import { recordAuditLog } from "@/server/audit/log";

const BATCH_SIZE = 20;

export type ProcessJobsSummary = {
  processed: number;
  succeeded: number;
  retried: number;
  dead: number;
};

function isKnownJobType(type: string): type is JobType {
  return type in jobHandlers;
}

export async function processPendingJobs(now: Date = new Date()): Promise<ProcessJobsSummary> {
  const candidates = await prisma.job.findMany({
    where: { status: "PENDING", runAfter: { lte: now } },
    orderBy: { runAfter: "asc" },
    take: BATCH_SIZE,
  });

  const summary: ProcessJobsSummary = { processed: 0, succeeded: 0, retried: 0, dead: 0 };

  for (const job of candidates) {
    const claim = await prisma.job.updateMany({
      where: { id: job.id, status: "PENDING" },
      data: { status: "RUNNING", lockedAt: now },
    });
    if (claim.count === 0) continue; // lost the race to another invocation

    summary.processed += 1;

    if (!isKnownJobType(job.type)) {
      // Not something we know how to run — retrying won't help. Dead
      // immediately rather than burning through attempts on a job type
      // that will never succeed (e.g. left over from a removed feature).
      logger.error("Job has unknown type, marking dead", { jobId: job.id, type: job.type });
      await prisma.job.update({
        where: { id: job.id },
        data: { status: "DEAD", lastError: `Unknown job type: ${job.type}`, completedAt: now },
      });
      summary.dead += 1;
      continue;
    }

    try {
      await jobHandlers[job.type](job.payload as never);
      await prisma.job.update({
        where: { id: job.id },
        data: { status: "SUCCEEDED", completedAt: now },
      });
      summary.succeeded += 1;
    } catch (caught) {
      const attempts = job.attempts + 1;
      const retryAt = nextRunAfter(attempts, job.maxAttempts, now);
      const errorInfo = err(caught);

      if (retryAt) {
        logger.warn("Job attempt failed, scheduling retry", {
          jobId: job.id,
          type: job.type,
          attempts,
          retryAt: retryAt.toISOString(),
          error: errorInfo,
        });
        await prisma.job.update({
          where: { id: job.id },
          data: { status: "PENDING", attempts, runAfter: retryAt, lastError: errorInfo.message, lockedAt: null },
        });
        summary.retried += 1;
      } else {
        // Exhausted retries — per the schema comment on JobStatus, DEAD
        // "alerts staff". Until a real alerting channel exists (see
        // CLAUDE.md, escalation deferred for now), this logged error and
        // audit entry are the alert: Sentry will surface `logger.error`
        // calls once it's wired up, and the audit log is human-visible
        // in the admin dashboard already.
        logger.error("Job exhausted all retries, marking dead", {
          jobId: job.id,
          type: job.type,
          attempts,
          error: errorInfo,
        });
        await prisma.job.update({
          where: { id: job.id },
          data: { status: "DEAD", attempts, lastError: errorInfo.message, lockedAt: null, completedAt: now },
        });
        await recordAuditLog({
          actorType: "SYSTEM",
          action: "JOB_DEAD",
          entityType: "Job",
          entityId: job.id,
          after: { type: job.type, payload: job.payload, error: errorInfo.message },
        });
        summary.dead += 1;
      }
    }
  }

  return summary;
}
