/**
 * Builds the `PricingContext` that `priceOrder()` (order-total.ts) needs,
 * straight from the database. This is the ONLY place that turns "what's
 * actually in Postgres right now" into the maps `priceOrder` operates on —
 * checkout calls it once to create a real order, and once (optionally) to
 * show a live preview total. Both calls go through this same loader, so
 * there's no second copy of "what counts as a valid product/modifier" to
 * drift out of sync.
 *
 * Deliberately generalized over `FulfilmentType` now (not hardcoded to
 * PICKUP) so Phase 4 (delivery) doesn't need to redesign this file — only
 * the caller's `fulfilmentType` argument changes.
 */

import { prisma } from "@/server/db";
import { syncExpiredAvailability } from "@/server/menu/sync-availability";
import { getSettings } from "@/server/settings/get-settings";
import type {
  FulfilmentType,
  ModifierGroupRule,
  PricedModifier,
  PricedProduct,
  PricingContext,
} from "@/server/pricing/order-total";

export async function loadPricingContext(fulfilmentType: FulfilmentType): Promise<PricingContext> {
  // Same self-heal every other menu-reading call site does (public menu,
  // admin product list) — a "sold out today" product whose window has
  // passed shouldn't block checkout just because nobody's viewed the menu
  // since local midnight.
  await syncExpiredAvailability();

  const [products, settings] = await Promise.all([
    prisma.product.findMany({
      where: { deletedAt: null },
      include: {
        modifierGroups: {
          include: {
            group: {
              include: { modifiers: { where: { deletedAt: null } } },
            },
          },
        },
      },
    }),
    getSettings(),
  ]);

  const productMap = new Map<string, PricedProduct>();
  const modifierMap = new Map<string, PricedModifier>();
  const groupMap = new Map<string, ModifierGroupRule>();
  const productGroups = new Map<string, string[]>();

  for (const product of products) {
    productMap.set(product.id, {
      id: product.id,
      menuNumber: product.menuNumber,
      name: product.name,
      priceCents: product.priceCents,
      vatRateBps: product.vatRateBps,
      isAvailable: product.isAvailable,
      isActive: product.isActive,
      deliveryEligible: product.deliveryEligible,
      pickupEligible: product.pickupEligible,
      containsAlcohol: product.containsAlcohol,
    });

    const groupIds: string[] = [];
    for (const pmg of product.modifierGroups) {
      const group = pmg.group;
      if (!group.isActive || group.deletedAt) continue;
      groupIds.push(group.id);

      if (!groupMap.has(group.id)) {
        groupMap.set(group.id, {
          id: group.id,
          name: group.name,
          minSelect: group.minSelect,
          maxSelect: group.maxSelect,
          isRequired: group.isRequired,
        });
      }

      for (const modifier of group.modifiers) {
        if (!modifierMap.has(modifier.id)) {
          modifierMap.set(modifier.id, {
            id: modifier.id,
            groupId: group.id,
            name: modifier.name,
            priceDeltaCents: modifier.priceDeltaCents,
            isAvailable: modifier.isAvailable,
          });
        }
      }
    }
    productGroups.set(product.id, groupIds);
  }

  return {
    fulfilmentType,
    products: productMap,
    modifiers: modifierMap,
    groups: groupMap,
    productGroups,
    minOrderCents: fulfilmentType === "PICKUP" ? settings.minOrderPickupCents : settings.minOrderDeliveryCents,
  };
}
