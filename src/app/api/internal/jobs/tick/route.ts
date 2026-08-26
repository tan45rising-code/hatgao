/**
 * Drains a batch of due jobs from the queue. Triggered by Vercel Cron
 * (see `vercel.json`) — there's no long-running worker process on
 * serverless hosting, so "the worker" is this endpoint, run on a
 * schedule instead of in a loop.
 *
 * Auth: Vercel automatically attaches `Authorization: Bearer
 * $CRON_SECRET` to cron-triggered requests when an env var named exactly
 * `CRON_SECRET` exists — see
 * https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs.
 * `INTERNAL_JOB_SECRET` (already reserved in `.env.example`, predating
 * this route) is accepted too, so either name works and this can also be
 * triggered manually (e.g. from another scheduler, or by hand while
 * testing) with a plain `curl` and the same header. Comparison is
 * constant-time so response timing can't be used to guess the secret.
 *
 * `force-dynamic` + `runtime = "nodejs"`: this must never be cached
 * (every invocation has to actually hit the DB) and Prisma needs the
 * Node runtime, not Edge — same reasoning as the Stripe webhook route.
 */

import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { processPendingJobs } from "@/server/jobs/process-jobs";
import { logger, err } from "@/server/logging/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(req: Request): boolean {
  const expected = process.env.CRON_SECRET || process.env.INTERNAL_JOB_SECRET;
  if (!expected) return false; // refuse to run unguarded rather than accepting anything

  const header = req.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";

  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const summary = await processPendingJobs();
    return NextResponse.json({ ok: true, ...summary });
  } catch (caught) {
    logger.error("Job tick failed", { error: err(caught) });
    return NextResponse.json({ ok: false, error: "Job tick failed." }, { status: 500 });
  }
}
