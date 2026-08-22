"use client";

import { useState } from "react";
import Link from "next/link";
import type { Category, ModifierGroup, Product } from "@prisma/client";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { formatCents } from "@/lib/money";
import { ProductPhotoField } from "./product-photo-field";

type ProductFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  categories: Category[];
  modifierGroups: ModifierGroup[];
  product?: Product & { modifierGroups: { groupId: string }[] };
  errorMessage?: string;
  /** Where "Cancel" goes back to — the list page's current category
   * filter, when there is one, so cancelling also returns to the same
   * filtered view instead of always landing on "all categories". */
  cancelHref?: string;
};

const VAT_OPTIONS = [
  { label: "5% — food", value: 500 },
  { label: "9% — soft drinks", value: 900 },
  { label: "19% — alcohol", value: 1900 },
];

export const PRODUCT_FORM_ERROR_MESSAGES: Record<string, string> = {
  invalid: "Please check the form — something wasn't valid.",
  alcohol_delivery: "Alcohol can't be marked delivery-eligible (Wolt Drive agreement). Uncheck one.",
  bad_image: "That file doesn't look like a valid image — please try a different photo.",
  upload_failed: "The photo couldn't be uploaded. Everything else was NOT saved — please try again.",
};

export function ProductForm({
  action,
  categories,
  modifierGroups,
  product,
  errorMessage,
  cancelHref = "/admin/menu/products",
}: ProductFormProps) {
  const attachedGroupIds = new Set(product?.modifierGroups.map((g) => g.groupId) ?? []);
  const [photoBusy, setPhotoBusy] = useState(false);

  return (
    <form action={action} className="max-w-2xl space-y-6">
      {errorMessage && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
          {errorMessage}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" required defaultValue={product?.name} />
        </div>
        <div>
          <Label htmlFor="categoryId">Category</Label>
          <Select id="categoryId" name="categoryId" required defaultValue={product?.categoryId}>
            <option value="" disabled>
              Choose a category
            </option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label htmlFor="menuNumber">Menu number (optional)</Label>
          <Input id="menuNumber" name="menuNumber" type="number" defaultValue={product?.menuNumber ?? ""} />
        </div>
        <div>
          <Label htmlFor="price">Price (€)</Label>
          <Input
            id="price"
            name="price"
            required
            placeholder="8.50"
            defaultValue={product ? (product.priceCents / 100).toFixed(2) : ""}
          />
          {product && (
            <p className="mt-1 text-xs text-neutral-500">Currently {formatCents(product.priceCents)}</p>
          )}
        </div>
        <div>
          <Label htmlFor="vatRateBps">VAT rate</Label>
          <Select id="vatRateBps" name="vatRateBps" defaultValue={product?.vatRateBps ?? 500}>
            {VAT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="prepMinutesOverride">Prep time override, minutes (optional)</Label>
          <Input
            id="prepMinutesOverride"
            name="prepMinutesOverride"
            type="number"
            defaultValue={product?.prepMinutesOverride ?? ""}
          />
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor="description">Description (optional)</Label>
          <Textarea id="description" name="description" rows={2} defaultValue={product?.description ?? ""} />
        </div>
      </div>

      <ProductPhotoField
        currentImageUrl={product?.imageUrl}
        productName={product?.name ?? "Product photo"}
        onBusyChange={setPhotoBusy}
      />

      <div className="space-y-2 rounded-md border border-neutral-200 bg-white p-4">
        <p className="text-sm font-semibold text-neutral-900">Fulfilment &amp; contents</p>
        <label className="flex items-center gap-2 text-sm text-neutral-800">
          <Checkbox name="deliveryEligible" defaultChecked={product?.deliveryEligible ?? true} />
          Available for delivery
        </label>
        <label className="flex items-center gap-2 text-sm text-neutral-800">
          <Checkbox name="pickupEligible" defaultChecked={product?.pickupEligible ?? true} />
          Available for pickup
        </label>
        <label className="flex items-center gap-2 text-sm text-neutral-800">
          <Checkbox name="containsAlcohol" defaultChecked={product?.containsAlcohol ?? false} />
          Contains alcohol
        </label>
        <p className="text-xs text-neutral-500">
          Alcohol can&apos;t also be delivery-eligible — the Wolt Drive agreement prohibits
          delivering age-verification products. Checking both is rejected before saving.
        </p>
        {product && (
          <label className="flex items-center gap-2 border-t border-neutral-200 pt-2 text-sm text-neutral-800">
            <Checkbox name="isActive" defaultChecked={product.isActive} />
            Keep this item on the menu (off means fully removed — for temporary sell-outs, use
            the status dropdown on the product list instead)
          </label>
        )}
      </div>

      {modifierGroups.length > 0 && (
        <div className="rounded-md border border-neutral-200 bg-white p-4">
          <p className="mb-2 text-sm font-semibold text-neutral-900">Modifier groups</p>
          <div className="space-y-1.5">
            {modifierGroups.map((group) => (
              <label key={group.id} className="flex items-center gap-2 text-sm text-neutral-800">
                <Checkbox
                  name="modifierGroupIds"
                  value={group.id}
                  defaultChecked={attachedGroupIds.has(group.id)}
                />
                {group.name}
              </label>
            ))}
          </div>
        </div>
      )}

      <details className="rounded-md border border-neutral-200 bg-neutral-50 p-4">
        <summary className="cursor-pointer text-sm font-medium text-neutral-700">
          Advanced (rarely needed)
        </summary>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {product && (
            <div>
              <Label htmlFor="slug">Web address (slug)</Label>
              <Input id="slug" name="slug" defaultValue={product.slug} />
              <p className="mt-1 text-xs text-neutral-500">
                Used internally to identify this item online. Auto-generated from the name — you
                don&apos;t need to touch this.
              </p>
            </div>
          )}
          <div>
            <Label htmlFor="sortOrder">Display order</Label>
            <Input id="sortOrder" name="sortOrder" type="number" defaultValue={product?.sortOrder ?? 0} />
            <p className="mt-1 text-xs text-neutral-500">
              Where this item appears within its category — lower numbers show first.
            </p>
          </div>
        </div>
      </details>

      <div className="flex gap-2">
        <Button type="submit" disabled={photoBusy}>
          {photoBusy ? "Uploading photo…" : product ? "Save" : "Create product"}
        </Button>
        <Link href={cancelHref} className={buttonVariants({ variant: "secondary" })}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
