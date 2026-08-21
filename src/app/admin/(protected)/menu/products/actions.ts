"use server";

/**
 * Product CRUD, including modifier-group attachment, availability status,
 * and photo upload.
 *
 * Reuses `parsePriceToCents`/`formatCents` (`src/lib/money.ts`, Phase 1) —
 * the admin types euros, the database only ever sees cents. VAT rate is a
 * dropdown over the fixed `VAT_FOOD`/`VAT_SOFT_DRINKS`/`VAT_ALCOHOL`
 * constants (same file), not free entry.
 *
 * The alcohol/delivery rule (Wolt Agreement §2.2-2.3, enforced at the
 * database level by the `products_alcohol_not_deliverable` CHECK
 * constraint — see `prisma/verify/004_constraints.sql`) is checked here
 * too, before the write, so a mistake surfaces as a normal form error
 * instead of a raw Postgres constraint violation.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/server/db";
import { recordAuditLog } from "@/server/audit/log";
import { slugify } from "@/lib/slug";
import { parsePriceToCents } from "@/lib/money";
import { nextLocalMidnightUtc } from "@/server/menu/availability";
import { processAndUploadProductImage, deleteProductImage, InvalidImageError } from "@/server/menu/product-image";

function checkboxValue(formData: FormData, name: string): boolean {
  return formData.get(name) === "on";
}

const productSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  slug: z.string().trim().min(1).optional(),
  categoryId: z.string().trim().min(1, "Category is required"),
  menuNumber: z.coerce.number().int().positive().optional().or(z.literal("").transform(() => undefined)),
  description: z.string().trim().optional(),
  price: z.string().trim().min(1, "Price is required"),
  vatRateBps: z.coerce.number().int(),
  prepMinutesOverride: z.coerce
    .number()
    .int()
    .positive()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  sortOrder: z.coerce.number().int().default(0),
});

async function requireOwner() {
  const session = await auth();
  if (!session) redirect("/admin/login");
  return session;
}

function parseModifierGroupIds(formData: FormData): string[] {
  return formData.getAll("modifierGroupIds").map(String);
}

async function syncModifierGroups(productId: string, groupIds: string[]) {
  await prisma.productModifierGroup.deleteMany({ where: { productId } });
  if (groupIds.length === 0) return;
  await prisma.productModifierGroup.createMany({
    data: groupIds.map((groupId, index) => ({
      productId,
      groupId,
      sortOrder: (index + 1) * 10,
    })),
  });
}

/** A `<input type="file">` with nothing chosen still submits a zero-byte File — treat that as "no upload". */
async function extractUploadedImageUrl(formData: FormData, errorRedirectPath: string): Promise<string | null> {
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) return null;
  try {
    return await processAndUploadProductImage(file);
  } catch (err) {
    if (err instanceof InvalidImageError) {
      redirect(`${errorRedirectPath}?error=bad_image`);
    }
    // BLOB_READ_WRITE_TOKEN missing/misconfigured, or a transient network
    // failure talking to Vercel Blob — either way, not the admin's mistake.
    redirect(`${errorRedirectPath}?error=upload_failed`);
  }
}

export async function createProductAction(formData: FormData): Promise<void> {
  const session = await requireOwner();
  const parsed = productSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin/menu/products/new?error=invalid");

  const priceCents = parsePriceToCents(parsed.data.price);
  const deliveryEligible = checkboxValue(formData, "deliveryEligible");
  const containsAlcohol = checkboxValue(formData, "containsAlcohol");
  if (containsAlcohol && deliveryEligible) {
    redirect("/admin/menu/products/new?error=alcohol_delivery");
  }

  const imageUrl = await extractUploadedImageUrl(formData, "/admin/menu/products/new");

  const { name, categoryId, menuNumber, description, vatRateBps, prepMinutesOverride, sortOrder } = parsed.data;

  const product = await prisma.product.create({
    data: {
      name,
      slug: slugify(name),
      categoryId,
      menuNumber: menuNumber ?? null,
      description: description || null,
      priceCents,
      vatRateBps,
      imageUrl,
      deliveryEligible,
      pickupEligible: checkboxValue(formData, "pickupEligible"),
      containsAlcohol,
      prepMinutesOverride: prepMinutesOverride ?? null,
      sortOrder,
    },
  });

  await syncModifierGroups(product.id, parseModifierGroupIds(formData));

  await recordAuditLog({
    actorType: "STAFF",
    actorId: session.user.id,
    action: "PRODUCT_CREATED",
    entityType: "Product",
    entityId: product.id,
    after: { name: product.name, priceCents: product.priceCents },
  });

  revalidatePath("/admin/menu/products");
  redirect("/admin/menu/products");
}

export async function updateProductAction(id: string, formData: FormData): Promise<void> {
  const session = await requireOwner();
  const before = await prisma.product.findUnique({ where: { id } });
  if (!before) redirect("/admin/menu/products");

  const parsed = productSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/admin/menu/products/${id}?error=invalid`);

  const priceCents = parsePriceToCents(parsed.data.price);
  const deliveryEligible = checkboxValue(formData, "deliveryEligible");
  const containsAlcohol = checkboxValue(formData, "containsAlcohol");
  if (containsAlcohol && deliveryEligible) {
    redirect(`/admin/menu/products/${id}?error=alcohol_delivery`);
  }

  const uploadedImageUrl = await extractUploadedImageUrl(formData, `/admin/menu/products/${id}`);
  const removePhoto = checkboxValue(formData, "removePhoto");
  let imageUrl = before.imageUrl;
  if (uploadedImageUrl) {
    if (before.imageUrl) await deleteProductImage(before.imageUrl);
    imageUrl = uploadedImageUrl;
  } else if (removePhoto && before.imageUrl) {
    await deleteProductImage(before.imageUrl);
    imageUrl = null;
  }

  const { name, slug, categoryId, menuNumber, description, vatRateBps, prepMinutesOverride, sortOrder } =
    parsed.data;
  const isActive = checkboxValue(formData, "isActive");

  const product = await prisma.product.update({
    where: { id },
    data: {
      name,
      slug: slug || before.slug,
      categoryId,
      menuNumber: menuNumber ?? null,
      description: description || null,
      priceCents,
      vatRateBps,
      imageUrl,
      deliveryEligible,
      pickupEligible: checkboxValue(formData, "pickupEligible"),
      containsAlcohol,
      prepMinutesOverride: prepMinutesOverride ?? null,
      sortOrder,
      isActive,
    },
  });

  await syncModifierGroups(product.id, parseModifierGroupIds(formData));

  await recordAuditLog({
    actorType: "STAFF",
    actorId: session.user.id,
    action: "PRODUCT_UPDATED",
    entityType: "Product",
    entityId: product.id,
    before: { name: before.name, priceCents: before.priceCents, isActive: before.isActive },
    after: { name: product.name, priceCents: product.priceCents, isActive: product.isActive },
  });

  revalidatePath("/admin/menu/products");
  redirect("/admin/menu/products");
}

/** `category` is the list page's current filter (bound in from the page,
 * not form input — see the form in products/page.tsx) so deleting a
 * product from a filtered view redirects back to that same filter instead
 * of silently dropping it back to "all categories". */
export async function deleteProductAction(id: string, category: string | null): Promise<void> {
  const session = await requireOwner();
  const product = await prisma.product.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false, isAvailable: false },
  });

  await recordAuditLog({
    actorType: "STAFF",
    actorId: session.user.id,
    action: "PRODUCT_DELETED",
    entityType: "Product",
    entityId: product.id,
  });

  revalidatePath("/admin/menu/products");
  redirect(category ? `/admin/menu/products?category=${category}` : "/admin/menu/products");
}

export type AvailabilityStatus = "available" | "unavailable" | "sold_out_today";

const AVAILABILITY_AUDIT_ACTION: Record<AvailabilityStatus, string> = {
  available: "PRODUCT_MARKED_AVAILABLE",
  unavailable: "PRODUCT_MARKED_UNAVAILABLE",
  sold_out_today: "PRODUCT_SOLD_OUT_TODAY",
};

/**
 * The status dropdown in the product list. Three states, not a plain
 * on/off toggle:
 *   - "available" — on the menu, orderable.
 *   - "unavailable" — off the menu until a staff member turns it back on,
 *     no automatic expiry (a genuinely discontinued-for-now item).
 *   - "sold_out_today" — off the menu until the next local midnight
 *     (Asia/Nicosia, from `settings.timezone`), then it comes back on its
 *     own — see `syncExpiredAvailability`
 *     (`src/server/menu/sync-availability.ts`) for how that actually
 *     happens without a background job.
 */
export async function updateAvailabilityStatusAction(id: string, formData: FormData): Promise<void> {
  const session = await requireOwner();
  const status = formData.get("status");
  if (status !== "available" && status !== "unavailable" && status !== "sold_out_today") {
    redirect("/admin/menu/products");
  }

  let availableAgainAt: Date | null = null;
  if (status === "sold_out_today") {
    const settings = await prisma.settings.findUnique({ where: { id: "singleton" } });
    availableAgainAt = nextLocalMidnightUtc(new Date(), settings?.timezone ?? "Asia/Nicosia");
  }

  const product = await prisma.product.update({
    where: { id },
    data: { isAvailable: status === "available", availableAgainAt },
  });

  await recordAuditLog({
    actorType: "STAFF",
    actorId: session.user.id,
    action: AVAILABILITY_AUDIT_ACTION[status],
    entityType: "Product",
    entityId: product.id,
    after: { isAvailable: product.isAvailable, availableAgainAt: product.availableAgainAt },
  });

  revalidatePath("/admin/menu/products");
}
