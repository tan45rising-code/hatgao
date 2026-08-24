"use server";

/**
 * Only the Settings fields Phase 3 has a consumer for: the pickup kill
 * switch, the pickup minimum, and prep-time defaults. Deliberately no UI
 * for delivery-related fields (Wolt fee constants, `deliveryEnabled`,
 * `minOrderDeliveryCents`, `largeOrderItemThreshold`) — those belong to
 * Phase 4/5, once something actually reads them.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/server/db";
import { recordAuditLog } from "@/server/audit/log";
import { parsePriceToCents } from "@/lib/money";
import { getSettings } from "@/server/settings/get-settings";

async function requireOwner() {
  const session = await auth();
  if (!session) redirect("/admin/login");
  return session;
}

const settingsSchema = z.object({
  pickupEnabled: z.coerce.boolean(),
  minOrderPickup: z.string().trim().min(1),
  defaultPrepMinutes: z.coerce.number().int().positive(),
  peakPrepMinutes: z.coerce.number().int().positive(),
});

export async function updateSettingsAction(formData: FormData): Promise<void> {
  const session = await requireOwner();
  const before = await getSettings();

  const parsed = settingsSchema.parse({
    pickupEnabled: formData.get("pickupEnabled") === "on",
    minOrderPickup: formData.get("minOrderPickup"),
    defaultPrepMinutes: formData.get("defaultPrepMinutes"),
    peakPrepMinutes: formData.get("peakPrepMinutes"),
  });

  const data = {
    pickupEnabled: parsed.pickupEnabled,
    minOrderPickupCents: parsePriceToCents(parsed.minOrderPickup),
    defaultPrepMinutes: parsed.defaultPrepMinutes,
    peakPrepMinutes: parsed.peakPrepMinutes,
  };

  await prisma.settings.upsert({
    where: { id: "singleton" },
    update: data,
    create: { id: "singleton", ...data },
  });

  await recordAuditLog({
    actorType: "STAFF",
    actorId: session.user.id,
    action: "SETTINGS_UPDATED",
    entityType: "Settings",
    entityId: "singleton",
    before: {
      pickupEnabled: before.pickupEnabled,
      minOrderPickupCents: before.minOrderPickupCents,
      defaultPrepMinutes: before.defaultPrepMinutes,
      peakPrepMinutes: before.peakPrepMinutes,
    },
    after: data,
  });

  revalidatePath("/admin/settings");
}
