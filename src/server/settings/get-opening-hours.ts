/**
 * DB loaders feeding `getAvailability()` (src/server/menu/availability.ts,
 * unchanged — this file exists only to get its input shape out of Postgres).
 *
 * `buildAvailabilityConfig()` is the one call site everything else in
 * Phase 3 uses to check whether the restaurant is open right now —
 * checkout, the settings/hours admin preview, etc. Nothing else should
 * touch the `OpeningHours`/`ServiceException` tables directly.
 */

import type { OpeningHoursRow, ServiceExceptionRow, AvailabilityConfig } from "@/server/menu/availability";
import { prisma } from "@/server/db";
import { getSettings } from "@/server/settings/get-settings";

export async function loadOpeningHours(): Promise<OpeningHoursRow[]> {
  const rows = await prisma.openingHours.findMany();
  return rows.map((r) => ({
    dayOfWeek: r.dayOfWeek as OpeningHoursRow["dayOfWeek"],
    opensAt: r.opensAt,
    closesAt: r.closesAt,
    isClosed: r.isClosed,
  }));
}

export async function loadServiceExceptions(): Promise<ServiceExceptionRow[]> {
  const rows = await prisma.serviceException.findMany();
  return rows.map((r) => ({
    // `date` is a stored calendar date (`@db.Date`), not an instant — no
    // timezone conversion belongs here. `toISOString().slice(0, 10)` on a
    // `@db.Date` column (midnight UTC under the hood) always yields the
    // date that was actually stored.
    date: r.date.toISOString().slice(0, 10),
    isClosed: r.isClosed,
    opensAt: r.opensAt,
    closesAt: r.closesAt,
    note: r.note,
  }));
}

/**
 * Everything `getAvailability()` needs, assembled from the DB.
 *
 * `lastOrderBufferMinutes` has no dedicated Settings column — per
 * `getAvailability`'s own doc comment it "defaults to the prep time," so
 * this feeds it `settings.defaultPrepMinutes`.
 */
export async function buildAvailabilityConfig(): Promise<AvailabilityConfig> {
  const [settings, hours, exceptions] = await Promise.all([
    getSettings(),
    loadOpeningHours(),
    loadServiceExceptions(),
  ]);

  return {
    timezone: settings.timezone,
    hours,
    exceptions,
    deliveryEnabled: settings.deliveryEnabled,
    pickupEnabled: settings.pickupEnabled,
    lastOrderBufferMinutes: settings.defaultPrepMinutes,
  };
}
