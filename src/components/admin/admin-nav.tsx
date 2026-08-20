"use client";

/**
 * The Categories / Products / Modifier groups nav. A client component
 * because highlighting "which page am I on" needs the current pathname —
 * `usePathname()` is client-only. Everything else in the admin stays
 * server-rendered; this is one small, self-contained exception.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/admin/menu", label: "Categories" },
  { href: "/admin/menu/products", label: "Products" },
  { href: "/admin/menu/modifier-groups", label: "Modifier groups" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-2 border-b border-neutral-200 bg-white px-6 py-3">
      {LINKS.map(({ href, label }) => {
        // "/admin/menu" is also a prefix of "/admin/menu/products", so it
        // needs an exact match; the other two are fine matching anything
        // nested under them (the product/group edit pages, etc.).
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
