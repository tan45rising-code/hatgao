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
import { reencodeStagedImage, deleteProductImage, InvalidImageError } from "@/server/menu/product-image";
import { revalidatePublicMenu } from "@/server/menu/revalidate-public-menu";

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

/** The list page's current category filter, carried through edit/delete
 * round-trips so "Save" (or "Cancel", or a delete-confirm) returns the
 * admin to the same filtered view they started from instead of always
 * dropping back to "all categories". Bound in from the page — see the
 * `category` param on products/page.tsx and [id]/page.tsx — never taken
 * from form input. */
function productsListPath(category: string | null): string {
  return category ? `/admin/menu/products?category=${category}` : "/admin/menu/products";
}

/** Same idea as `productsListPath`, but for redirecting back to the edit
 * form itself (validation errors) rather than the list. */
function editProductPath(id: string, category: string | null, error?: string): string {
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (error) params.set("error", error);
  const qs = params.toString();
  return `/admin/menu/products/${id}${qs ? `?${qs}` : ""}`;
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

/**
 * The photo itself never reaches this Server Action — the browser
 * uploads it directly to Blob storage (product-photo-field.tsx) and the
 * form only carries the resulting URL, a plain string field. That's a
 * deliberate workaround for Vercel's ~4.5MB Serverless Function body cap,
 * not an optional nicety — see src/server/menu/product-image.ts for the
 * full explanation. `reencodeStagedImage` is what actually validates the
 * bytes behind that URL.
 */
async function extractUploadedImageUrl(
  formData: FormData,
  buildErrorPath: (error: "bad_image" | "upload_failed") => string,
): Promise<string | null> {
  const stagedUrl = formData.get("stagedImageUrl");
  if (typeof stagedUrl !== "string" || stagedUrl.length === 0) return null;
  try {
    return await reencodeStagedImage(stagedUrl);
  } catch (err) {
    // BLOB_READ_WRITE_TOKEN missing/misconfigured, or a transient network
    // failure talking to Vercel Blob, gets "upload_failed"; a file that
    // doesn't decode as a real image gets "bad_image". Built via a
    // callback rather than string concatenation because the edit form's
    // error path may already carry a `?category=` query string — naively
    // appending `?error=` would produce an invalid double `?`.
    redirect(buildErrorPath(err instanceof InvalidImageError ? "bad_image" : "upload_failed"));
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

  const imageUrl = await extractUploadedImageUrl(formData, (error) => `/admin/menu/products/new?error=${error}`);

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
  revalidatePublicMenu();
  redirect("/admin/menu/products");
}

/** `category` is the list page's current filter (bound in from the page,
 * not form input — see the form in [id]/page.tsx), so saving from a
 * category-filtered view returns to that same filter instead of always
 * landing back on "all categories". */
export async function updateProductAction(id: string, category: string | null, formData: FormData): Promise<void> {
  const session = await requireOwner();
  const before = await prisma.product.findUnique({ where: { id } });
  if (!before) redirect(productsListPath(category));

  const parsed = productSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(editProductPath(id, category, "invalid"));

  const priceCents = parsePriceToCents(parsed.data.price);
  const deliveryEligible = checkboxValue(formData, "deliveryEligible");
  const containsAlcohol = checkboxValue(formData, "containsAlcohol");
  if (containsAlcohol && deliveryEligible) {
    redirect(editProductPath(id, category, "alcohol_delivery"));
  }

  const uploadedImageUrl = await extractUploadedImageUrl(formData, (error) => editProductPath(id, category, error));
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
  revalidatePublicMenu();
  redirect(productsListPath(category));
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
  revalidatePublicMenu();
  redirect(productsListPath(category));
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
  revalidatePublicMenu();
}
