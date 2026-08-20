/**
 * The audit trail.
 *
 * Every privileged action writes here — who, what, when, from where (H.3).
 * This is a thin wrapper rather than bare `prisma.auditLog.create` calls
 * scattered through the codebase, so the shape of an audit entry only has
 * to be gotten right in one place.
 */

import type { ActorType, Prisma } from "@prisma/client";
import { prisma } from "@/server/db";

export type AuditLogEntry = {
  actorType: ActorType;
  /** Null for actions with no attributable actor (e.g. a system script). */
  actorId?: string | null;
  /** Short machine-readable verb, e.g. "LOGIN_SUCCESS", "LOGIN_FAILURE", "STAFF_CREATED". */
  action: string;
  /** What kind of thing was acted on, e.g. "StaffUser". */
  entityType: string;
  entityId?: string | null;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export async function recordAuditLog(entry: AuditLogEntry): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorType: entry.actorType,
      actorId: entry.actorId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      before: entry.before,
      after: entry.after,
      ipAddress: entry.ipAddress ?? null,
      userAgent: entry.userAgent ?? null,
    },
  });
}
