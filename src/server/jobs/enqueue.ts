/**
 * Write side of the job queue — see `process-jobs.ts` for the worker that
 * reads these back out. Thin wrapper over `prisma.job.create`, same
 * reasoning as `src/server/audit/log.ts`: the row shape only needs to be
 * gotten right in one place.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import type { JobPayloads, JobType } from "@/server/jobs/types";

export async function enqueueJob<T extends JobType>(
  type: T,
  payload: JobPayloads[T],
  options?: { runAfter?: Date },
): Promise<void> {
  await prisma.job.create({
    data: {
      type,
      payload: payload as unknown as Prisma.InputJsonValue,
      runAfter: options?.runAfter ?? new Date(),
    },
  });
}
