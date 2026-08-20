import Link from "next/link";
import { prisma } from "@/server/db";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { createCategoryAction, updateCategoryAction, deleteCategoryAction } from "./actions";

export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; confirm?: string; error?: string }>;
}) {
  const { edit, confirm, error } = await searchParams;

  const categories = await prisma.category.findMany({
    where: { deletedAt: null },
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { products: true } } },
  });

  const editing = edit ? categories.find((c) => c.id === edit) : undefined;

  return (
    <div className="max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-neutral-900">Categories</h1>
      </div>

      {error && (
        <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
          Please check the form — something wasn&apos;t valid.
        </p>
      )}

      <div className="mb-6 rounded-md border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">
          {editing ? `Edit "${editing.name}"` : "Add a category"}
        </h2>
        <form
          action={editing ? updateCategoryAction.bind(null, editing.id) : createCategoryAction}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" required defaultValue={editing?.name} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Input id="description" name="description" defaultValue={editing?.description ?? ""} />
            </div>
          </div>

          {editing && (
            <label className="flex items-center gap-2 text-sm text-neutral-800">
              <Checkbox name="isActive" defaultChecked={editing.isActive} />
              Active (shown on the menu)
            </label>
          )}

          <details className="rounded-md border border-neutral-200 bg-neutral-50 p-4">
            <summary className="cursor-pointer text-sm font-medium text-neutral-700">
              Advanced (rarely needed)
            </summary>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {editing && (
                <div>
                  <Label htmlFor="slug">Web address (slug)</Label>
                  <Input id="slug" name="slug" defaultValue={editing.slug} />
                  <p className="mt-1 text-xs text-neutral-500">
                    Used internally to identify this category online. Auto-generated from the
                    name — you don&apos;t need to touch this.
                  </p>
                </div>
              )}
              <div>
                <Label htmlFor="sortOrder">Display order</Label>
                <Input id="sortOrder" name="sortOrder" type="number" defaultValue={editing?.sortOrder ?? 0} />
                <p className="mt-1 text-xs text-neutral-500">
                  Where this category appears on the menu — lower numbers show first.
                </p>
              </div>
            </div>
          </details>

          <div className="flex gap-2">
            <Button type="submit">{editing ? "Save" : "Add category"}</Button>
            {editing && (
              <Link href="/admin/menu" className={buttonVariants({ variant: "secondary" })}>
                Cancel
              </Link>
            )}
          </div>
        </form>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Products</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {categories.map((category) => (
            <TableRow key={category.id}>
              <TableCell className="font-medium">{category.name}</TableCell>
              <TableCell>
                <Badge variant={category.isActive ? "success" : "neutral"}>
                  {category.isActive ? "Active" : "Inactive"}
                </Badge>
              </TableCell>
              <TableCell className="text-neutral-700">{category._count.products}</TableCell>
              <TableCell>
                {confirm === category.id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-neutral-700">Delete?</span>
                    <form action={deleteCategoryAction.bind(null, category.id)}>
                      <Button type="submit" variant="destructive" size="sm">
                        Confirm
                      </Button>
                    </form>
                    <Link href="/admin/menu" className={buttonVariants({ variant: "secondary", size: "sm" })}>
                      Cancel
                    </Link>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/admin/menu?edit=${category.id}`}
                      className={buttonVariants({ variant: "secondary", size: "sm" })}
                    >
                      Edit
                    </Link>
                    <Link
                      href={`/admin/menu?confirm=${category.id}`}
                      className={buttonVariants({ variant: "destructive", size: "sm" })}
                    >
                      Delete
                    </Link>
                  </div>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
