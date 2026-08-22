import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { ProductForm, PRODUCT_FORM_ERROR_MESSAGES } from "../product-form";
import { updateProductAction } from "../actions";

export default async function EditProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; category?: string }>;
}) {
  const { id } = await params;
  const { error, category } = await searchParams;

  const [product, categories, modifierGroups] = await Promise.all([
    prisma.product.findUnique({ where: { id }, include: { modifierGroups: true } }),
    prisma.category.findMany({ where: { deletedAt: null }, orderBy: { sortOrder: "asc" } }),
    prisma.modifierGroup.findMany({ where: { deletedAt: null, isActive: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  if (!product || product.deletedAt) notFound();

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold text-neutral-900">Edit {product.name}</h1>
      <ProductForm
        action={updateProductAction.bind(null, product.id, category ?? null)}
        categories={categories}
        modifierGroups={modifierGroups}
        product={product}
        errorMessage={error ? PRODUCT_FORM_ERROR_MESSAGES[error] : undefined}
        cancelHref={category ? `/admin/menu/products?category=${category}` : "/admin/menu/products"}
      />
    </div>
  );
}
