import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/server/db";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { CategoryFilter } from "@/components/admin/category-filter";
import { StatusSelect } from "@/components/admin/status-select";
import { formatCents } from "@/lib/money";
import { syncExpiredAvailability } from "@/server/menu/sync-availability";
import { deleteProductAction, updateAvailabilityStatusAction, type AvailabilityStatus } from "./actions";

function statusOf(product: { isAvailable: boolean; availableAgainAt: Date | null }): AvailabilityStatus {
  if (product.isAvailable) return "available";
  return product.availableAgainAt ? "sold_out_today" : "unavailable";
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; confirm?: string }>;
}) {
  const { category, confirm } = await searchParams;

  // STAFF can reach this page (middleware.ts) to view products and change
  // availability status — everything else here (create, edit, delete) is
  // OWNER-only, enforced for real in actions.ts's requireOwnerRole(); this
  // is just the UI following suit so STAFF never see a button that would
  // redirect them straight back here anyway.
  const session = await auth();
  const isOwner = session?.user.role === "OWNER";

  // Self-healing: anything marked "sold out for today" whose reset time has
  // passed comes back automatically, checked right before we list them —
  // see src/server/menu/sync-availability.ts for why this doesn't need a
  // background job.
  await syncExpiredAvailability();

  const [categories, products] = await Promise.all([
    prisma.category.findMany({ where: { deletedAt: null }, orderBy: { sortOrder: "asc" } }),
    prisma.product.findMany({
      where: { deletedAt: null, ...(category ? { categoryId: category } : {}) },
      // "All categories" orders by menu number (lower first) so the list
      // reads the same way the printed menu does — products without a
      // menu number yet sort last rather than jumbling in at the front.
      // A single filtered category keeps its own manually-set sortOrder,
      // since that's the order staff deliberately arranged within it.
      orderBy: category ? [{ sortOrder: "asc" }] : [{ menuNumber: { sort: "asc", nulls: "last" } }, { sortOrder: "asc" }],
      include: { category: true },
    }),
  ]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-neutral-900">Products</h1>
        {isOwner && (
          <Link href="/admin/menu/products/new" className={buttonVariants({})}>
            New product
          </Link>
        )}
      </div>

      <div className="mb-4">
        <CategoryFilter categories={categories} current={category} />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead />
            <TableHead>#</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Price</TableHead>
            <TableHead>Status</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((product) => (
            <TableRow key={product.id}>
              <TableCell>
                {product.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- remote Blob URL
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    className="h-10 w-10 rounded-md border border-neutral-200 object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-md border border-dashed border-neutral-300 text-[10px] text-neutral-400">
                    No photo
                  </div>
                )}
              </TableCell>
              <TableCell className="text-neutral-600">{product.menuNumber ?? "—"}</TableCell>
              <TableCell className="font-medium">
                {product.name}
                {product.containsAlcohol && (
                  <Badge variant="warning" className="ml-2">
                    Alcohol
                  </Badge>
                )}
                {!product.isActive && (
                  <Badge variant="neutral" className="ml-2">
                    Off-menu
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-neutral-700">{product.category.name}</TableCell>
              <TableCell>{formatCents(product.priceCents)}</TableCell>
              <TableCell>
                <form action={updateAvailabilityStatusAction.bind(null, product.id)}>
                  {/* Keyed by product + current status: when the server sends a
                      genuinely new status (after this select's own auto-submit
                      revalidates the page), React remounts a fresh instance
                      instead of trying to resync stale local state — see the
                      comment in status-select.tsx for why that's the robust
                      choice here, not just a preference. */}
                  <StatusSelect key={`${product.id}-${statusOf(product)}`} defaultValue={statusOf(product)} />
                </form>
              </TableCell>
              <TableCell>
                {!isOwner ? null : confirm === product.id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-neutral-700">Delete?</span>
                    <form action={deleteProductAction.bind(null, product.id, category ?? null)}>
                      <Button type="submit" variant="destructive" size="sm">
                        Confirm
                      </Button>
                    </form>
                    <Link
                      href="/admin/menu/products"
                      className={buttonVariants({ variant: "secondary", size: "sm" })}
                    >
                      Cancel
                    </Link>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/admin/menu/products/${product.id}${category ? `?category=${category}` : ""}`}
                      className={buttonVariants({ variant: "secondary", size: "sm" })}
                    >
                      Edit
                    </Link>
                    <Link
                      href={`/admin/menu/products?confirm=${product.id}${category ? `&category=${category}` : ""}`}
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
