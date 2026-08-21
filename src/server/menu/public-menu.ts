/**
 * The customer-facing menu query — everything `src/app/(customer)` renders
 * comes from here.
 *
 * Deliberately narrower than the admin product query
 * (`src/app/admin/(protected)/menu/products/page.tsx`): customers only ever
 * see active, in-stock, non-deleted items. Availability is self-healing the
 * same way the admin list is — see `syncExpiredAvailability` — so this is
 * now the SECOND call site for it, not the only one (the doc comment on
 * that function predates this file).
 *
 * No fulfilment-type (delivery/pickup) filtering happens here. Browsing
 * shows everything; eligibility (e.g. "beer can't be delivered") is a
 * checkout-time concern once Phase 3 introduces fulfilment selection — see
 * `src/server/pricing/order-total.ts`, which already enforces it for real
 * once there's an actual order to price.
 */

import { prisma } from "@/server/db";
import { syncExpiredAvailability } from "./sync-availability";

export type PublicModifier = {
  id: string;
  name: string;
  priceDeltaCents: number;
  isDefault: boolean;
};

export type PublicModifierGroup = {
  id: string;
  name: string;
  description: string | null;
  minSelect: number;
  maxSelect: number;
  isRequired: boolean;
  modifiers: PublicModifier[];
};

export type PublicProduct = {
  id: string;
  menuNumber: number | null;
  name: string;
  slug: string;
  description: string | null;
  priceCents: number;
  vatRateBps: number;
  imageUrl: string | null;
  imageAlt: string | null;
  deliveryEligible: boolean;
  pickupEligible: boolean;
  containsAlcohol: boolean;
  modifierGroups: PublicModifierGroup[];
};

export type PublicCategory = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  products: PublicProduct[];
};

export async function getPublicMenu(): Promise<PublicCategory[]> {
  await syncExpiredAvailability();

  const categories = await prisma.category.findMany({
    where: { deletedAt: null, isActive: true },
    orderBy: { sortOrder: "asc" },
    include: {
      products: {
        where: { deletedAt: null, isActive: true, isAvailable: true },
        orderBy: { sortOrder: "asc" },
        include: {
          modifierGroups: {
            include: {
              group: {
                include: {
                  modifiers: {
                    where: { deletedAt: null, isAvailable: true },
                    orderBy: { sortOrder: "asc" },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  return categories
    .map((category) => ({
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description,
      products: category.products.map((product) => ({
        id: product.id,
        menuNumber: product.menuNumber,
        name: product.name,
        slug: product.slug,
        description: product.description,
        priceCents: product.priceCents,
        vatRateBps: product.vatRateBps,
        imageUrl: product.imageUrl,
        imageAlt: product.imageAlt,
        deliveryEligible: product.deliveryEligible,
        pickupEligible: product.pickupEligible,
        containsAlcohol: product.containsAlcohol,
        modifierGroups: product.modifierGroups
          .filter((pmg) => pmg.group.isActive && pmg.group.deletedAt === null)
          .sort((a, b) => a.group.sortOrder - b.group.sortOrder)
          .map((pmg) => ({
            id: pmg.group.id,
            name: pmg.group.name,
            description: pmg.group.description,
            minSelect: pmg.group.minSelect,
            maxSelect: pmg.group.maxSelect,
            isRequired: pmg.group.isRequired,
            modifiers: pmg.group.modifiers.map((m) => ({
              id: m.id,
              name: m.name,
              priceDeltaCents: m.priceDeltaCents,
              isDefault: m.isDefault,
            })),
          })),
      })),
    }))
    // A category with every product sold out (or none at all) is dead
    // weight in the nav — drop it rather than show an empty section.
    .filter((category) => category.products.length > 0);
}
