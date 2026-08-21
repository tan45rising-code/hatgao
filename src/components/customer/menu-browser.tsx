"use client";

import { useState } from "react";
import type { PublicCategory, PublicProduct } from "@/server/menu/public-menu";
import { CategoryNav, categorySectionId } from "./category-nav";
import { ProductCard } from "./product-card";
import { ProductDetailSheet } from "./product-detail-sheet";

export function MenuBrowser({ categories }: { categories: PublicCategory[] }) {
  const [selectedProduct, setSelectedProduct] = useState<PublicProduct | null>(null);

  return (
    <>
      <CategoryNav categories={categories} />

      <main className="mx-auto max-w-3xl px-3 pb-28 pt-4 sm:px-6">
        {categories.map((category) => (
          <section
            key={category.id}
            id={categorySectionId(category.id)}
            data-category-id={category.id}
            className="scroll-mt-16 py-4"
          >
            <h2 className="font-display mb-1 text-xl font-semibold text-hg-ink">{category.name}</h2>
            {category.description && (
              <p className="mb-3 text-sm text-hg-brown/60">{category.description}</p>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {category.products.map((product) => (
                <ProductCard key={product.id} product={product} onSelect={setSelectedProduct} />
              ))}
            </div>
          </section>
        ))}
      </main>

      <ProductDetailSheet product={selectedProduct} onClose={() => setSelectedProduct(null)} />
    </>
  );
}
