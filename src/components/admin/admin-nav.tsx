"use client";

/**
 * Admin nav. A client component because highlighting "which page am I
 * on" needs the current pathname — `usePathname()` is client-only.
 * Everything else in the admin stays server-rendered; this is one small,
 * self-contained exception.
 *
 * Takes `role` so STAFF (a kitchen-tablet login) sees just "Orders" —
 * everything else here is OWNER territory (menu, hours, settings — H.3:
 * "OWNER: menu, pricing, promotions, settings, analytics, refunds").
 */

import type { StaffRole } from "@prisma/client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const STAFF_LINKS = [{ href: "/admin/orders", label: "Orders" }];

const OWNER_LINKS = [
  ...STAFF_LINKS,
  { href: "/admin/menu", label: "Categories" },
  { href: "/admin/menu/products", label: "Products" },
  { href: "/admin/menu/modifier-groups", label: "Modifier groups" },
  { href: "/admin/hours", label: "Hours" },
  { href: "/admin/settings", label: "Settings" },
];

export function AdminNav({ role }: { role: StaffRole }) {
  const pathname = usePathname();
  const links = role === "OWNER" ? OWNER_LINKS : STAFF_LINKS;

  return (
    <nav className="flex gap-2 border-b border-neutral-200 bg-white px-6 py-3">
      {links.map(({ href, label }) => {
        // "/admin/menu" is also a prefix of "/admin/menu/products", so it
        // needs an exact match; the rest are fine matching anything
        // nested under them (edit pages, etc.).
        const active = href === "/admin/menu" ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "rounded-md px-4 py-2 text-base font-semibold transition-colors",
              active
                ? "bg-neutral-900 text-white"
                : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
