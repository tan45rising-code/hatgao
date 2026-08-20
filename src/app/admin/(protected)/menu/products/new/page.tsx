import { prisma } from "@/server/db";
import { ProductForm, PRODUCT_FORM_ERROR_MESSAGES } from "../product-form";
import { createProductAction } from "../actions";

export default async function NewProductPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  const [categories, modifierGroups] = await Promise.all([
    prisma.category.findMany({ where: { deletedAt: null, isActive: true }, orderBy: { sortOrder: "asc" } }),
    prisma.modifierGroup.findMany({ where: { deletedAt: null, isActive: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold text-neutral-900">New product</h1>
      <ProductForm
        action={createProductAction}
        categories={categories}
        modifierGroups={modifierGroups}
        errorMessage={error ? PRODUCT_FORM_ERROR_MESSAGES[error] : undefined}
      />
    </div>
  );
}
