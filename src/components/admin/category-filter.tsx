"use client";

/**
 * The category filter on the product list. Navigates the moment a
 * category is chosen — no separate "Filter" button.
 */

import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/select";

export function CategoryFilter({
  categories,
  current,
}: {
  categories: { id: string; name: string }[];
  current?: string;
}) {
  const router = useRouter();

  return (
    <Select
      defaultValue={current ?? ""}
      onChange={(e) => {
        const value = e.target.value;
        router.push(value ? `/admin/menu/products?category=${value}` : "/admin/menu/products");
      }}
      className="max-w-xs"
    >
      <option value="">All categories</option>
      {categories.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </Select>
  );
}
