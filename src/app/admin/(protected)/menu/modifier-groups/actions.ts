"use server";

/**
 * Modifier group CRUD, plus the modifiers within a group — modifiers have
 * no standalone screen (`Modifier.groupId` is required, they only ever
 * belong to one group), so they're managed inline from their parent
 * group's edit page.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/server/db";
import { recordAuditLog } from "@/server/audit/log";
import { parsePriceToCents } from "@/lib/money";

function checkboxValue(formData: FormData, name: string): boolean {
  return formData.get(name) === "on";
}

const groupSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  description: z.string().trim().optional(),
  minSelect: z.coerce.number().int().min(0).default(1),
  maxSelect: z.coerce.number().int().min(0).default(1),
  sortOrder: z.coerce.number().int().default(0),
});

const modifierSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  priceDelta: z.string().trim().default("0"),
});

async function requireOwner() {
  const session = await auth();
  if (!session) redirect("/admin/login");
  return session;
}

export async function createGroupAction(formData: FormData): Promise<void> {
  const session = await requireOwner();
  const parsed = groupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin/menu/modifier-groups/new?error=invalid");
  if (parsed.data.maxSelect < parsed.data.minSelect) {
    redirect("/admin/menu/modifier-groups/new?error=range");
  }

  const { name, description, minSelect, maxSelect, sortOrder } = parsed.data;
  const group = await prisma.modifierGroup.create({
    data: {
      name,
      description: description || null,
      minSelect,
      maxSelect,
      isRequired: checkboxValue(formData, "isRequired"),
      sortOrder,
    },
  });

  await recordAuditLog({
    actorType: "STAFF",
    actorId: session.user.id,
    action: "MODIFIER_GROUP_CREATED",
    entityType: "ModifierGroup",
    entityId: group.id,
    after: { name: group.name },
  });

  revalidatePath("/admin/menu/modifier-groups");
  redirect(`/admin/menu/modifier-groups/${group.id}`);
}

export async function updateGroupAction(id: string, formData: FormData): Promise<void> {
  const session = await requireOwner();
  const before = await prisma.modifierGroup.findUnique({ where: { id } });
  if (!before) redirect("/admin/menu/modifier-groups");

  const parsed = groupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/admin/menu/modifier-groups/${id}?error=invalid`);
  if (parsed.data.maxSelect < parsed.data.minSelect) {
    redirect(`/admin/menu/modifier-groups/${id}?error=range`);
  }

  const { name, description, minSelect, maxSelect, sortOrder } = parsed.data;
  const group = await prisma.modifierGroup.update({
    where: { id },
    data: {
      name,
      description: description || null,
      minSelect,
      maxSelect,
      isRequired: checkboxValue(formData, "isRequired"),
      isActive: checkboxValue(formData, "isActive"),
      sortOrder,
    },
  });

  await recordAuditLog({
    actorType: "STAFF",
    actorId: session.user.id,
    action: "MODIFIER_GROUP_UPDATED",
    entityType: "ModifierGroup",
    entityId: group.id,
    before: { name: before.name, isActive: before.isActive },
    after: { name: group.name, isActive: group.isActive },
  });

  revalidatePath("/admin/menu/modifier-groups");
  redirect(`/admin/menu/modifier-groups/${id}`);
}

export async function deleteGroupAction(id: string): Promise<void> {
  const session = await requireOwner();
  const group = await prisma.modifierGroup.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false },
  });

  await recordAuditLog({
    actorType: "STAFF",
    actorId: session.user.id,
    action: "MODIFIER_GROUP_DELETED",
    entityType: "ModifierGroup",
    entityId: group.id,
  });

  revalidatePath("/admin/menu/modifier-groups");
  redirect("/admin/menu/modifier-groups");
}

export async function createModifierAction(groupId: string, formData: FormData): Promise<void> {
  const session = await requireOwner();
  const parsed = modifierSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/admin/menu/modifier-groups/${groupId}?error=invalid`);

  // Display order isn't a field in the quick-add form — new modifiers just
  // go on the end, same as how products/categories default to 0 and get
  // reordered later via the Advanced section if it ever matters.
  const existingCount = await prisma.modifier.count({ where: { groupId, deletedAt: null } });

  const { name, priceDelta } = parsed.data;
  const modifier = await prisma.modifier.create({
    data: {
      groupId,
      name,
      priceDeltaCents: parsePriceToCents(priceDelta || "0"),
      isDefault: checkboxValue(formData, "isDefault"),
      sortOrder: (existingCount + 1) * 10,
    },
  });

  await recordAuditLog({
    actorType: "STAFF",
    actorId: session.user.id,
    action: "MODIFIER_CREATED",
    entityType: "Modifier",
    entityId: modifier.id,
    after: { name: modifier.name, priceDeltaCents: modifier.priceDeltaCents },
  });

  revalidatePath(`/admin/menu/modifier-groups/${groupId}`);
  redirect(`/admin/menu/modifier-groups/${groupId}`);
}

export async function deleteModifierAction(groupId: string, modifierId: string): Promise<void> {
  const session = await requireOwner();
  const modifier = await prisma.modifier.update({
    where: { id: modifierId },
    data: { deletedAt: new Date(), isAvailable: false },
  });

  await recordAuditLog({
    actorType: "STAFF",
    actorId: session.user.id,
    action: "MODIFIER_DELETED",
    entityType: "Modifier",
    entityId: modifier.id,
  });

  revalidatePath(`/admin/menu/modifier-groups/${groupId}`);
  redirect(`/admin/menu/modifier-groups/${groupId}`);
}

export async function toggleModifierAvailabilityAction(groupId: string, modifierId: string): Promise<void> {
  const session = await requireOwner();
  const before = await prisma.modifier.findUnique({ where: { id: modifierId } });
  if (!before) redirect(`/admin/menu/modifier-groups/${groupId}`);

  const modifier = await prisma.modifier.update({
    where: { id: modifierId },
    data: { isAvailable: !before.isAvailable },
  });

  await recordAuditLog({
    actorType: "STAFF",
    actorId: session.user.id,
    action: modifier.isAvailable ? "MODIFIER_ENABLED" : "MODIFIER_DISABLED",
    entityType: "Modifier",
    entityId: modifier.id,
  });

  revalidatePath(`/admin/menu/modifier-groups/${groupId}`);
}
