"use server";

/**
 * Category CRUD. OWNER-only access is enforced at the route level by
 * `src/middleware.ts` (the `/admin/menu` prefix), not repeated here — see
 * the Slice 3 design notes for why.
 *
 * The slug is generated server-side from the name at creation time
 * (`slugify`, `src/lib/slug.ts`) rather than live-previewed as the admin
 * types — simpler than wiring a client component for it, and still fully
 * editable afterward from the edit form.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/server/db";
import { recordAuditLog } from "@/server/audit/log";
import { slugify } from "@/lib/slug";
import { revalidatePublicMenu } from "@/server/menu/revalidate-public-menu";

// A native checkbox is absent from FormData entirely when unchecked (not
// `false`, not empty — genuinely missing, the same class of gotcha as the
// `code: null` bug in the 2FA login form). Zod's `.coerce.boolean()` can't
// tell "unchecked" from "field never existed" apart from a truthy value,
// so every boolean toggle across this slice reads directly off FormData
// with this helper instead of going through the schema.
function checkboxValue(formData: FormData, name: string): boolean {
  return formData.get(name) === "on";
}

const categorySchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  slug: z.string().trim().min(1).optional(),
  description: z.string().trim().optional(),
  sortOrder: z.coerce.number().int().default(0),
});

async function requireOwner() {
  const session = await auth();
  if (!session) redirect("/admin/login");
  return session;
}

export async function createCategoryAction(formData: FormData): Promise<void> {
  const session = await requireOwner();
  const parsed = categorySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin/menu?error=invalid");

  const { name, description, sortOrder } = parsed.data;
  const category = await prisma.category.create({
    data: { name, slug: slugify(name), description: description || null, sortOrder },
  });

  await recordAuditLog({
    actorType: "STAFF",
    actorId: session.user.id,
    action: "CATEGORY_CREATED",
    entityType: "Category",
    entityId: category.id,
    after: { name: category.name, slug: category.slug },
  });

  revalidatePath("/admin/menu");
  revalidatePublicMenu();
  redirect("/admin/menu");
}

export async function updateCategoryAction(id: string, formData: FormData): Promise<void> {
  const session = await requireOwner();
  const parsed = categorySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/admin/menu?edit=${id}&error=invalid`);

  const before = await prisma.category.findUnique({ where: { id } });
  if (!before) redirect("/admin/menu");

  const { name, slug, description, sortOrder } = parsed.data;
  const isActive = checkboxValue(formData, "isActive");
  const category = await prisma.category.update({
    where: { id },
    data: { name, slug: slug || before.slug, description: description || null, sortOrder, isActive },
  });

  await recordAuditLog({
    actorType: "STAFF",
    actorId: session.user.id,
    action: "CATEGORY_UPDATED",
    entityType: "Category",
    entityId: category.id,
    before: { name: before.name, slug: before.slug, isActive: before.isActive },
    after: { name: category.name, slug: category.slug, isActive: category.isActive },
  });

  revalidatePath("/admin/menu");
  revalidatePublicMenu();
  redirect("/admin/menu");
}

export async function deleteCategoryAction(id: string): Promise<void> {
  const session = await requireOwner();
  const category = await prisma.category.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false },
  });

  await recordAuditLog({
    actorType: "STAFF",
    actorId: session.user.id,
    action: "CATEGORY_DELETED",
    entityType: "Category",
    entityId: category.id,
  });

  revalidatePath("/admin/menu");
  revalidatePublicMenu();
  redirect("/admin/menu");
}
