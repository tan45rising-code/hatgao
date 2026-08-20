import Link from "next/link";
import { prisma } from "@/server/db";
import { buttonVariants, Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { deleteGroupAction } from "./actions";

export default async function ModifierGroupsPage({
  searchParams,
}: {
  searchParams: Promise<{ confirm?: string }>;
}) {
  const { confirm } = await searchParams;

  const groups = await prisma.modifierGroup.findMany({
    where: { deletedAt: null },
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { modifiers: true } } },
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-neutral-900">Modifier groups</h1>
        <Link href="/admin/menu/modifier-groups/new" className={buttonVariants({})}>
          New group
        </Link>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Selection</TableHead>
            <TableHead>Modifiers</TableHead>
            <TableHead>Status</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group) => (
            <TableRow key={group.id}>
              <TableCell className="font-medium">{group.name}</TableCell>
              <TableCell className="text-neutral-700">
                {group.minSelect}–{group.maxSelect} {group.isRequired && "(required)"}
              </TableCell>
              <TableCell className="text-neutral-700">{group._count.modifiers}</TableCell>
              <TableCell>
                <Badge variant={group.isActive ? "success" : "neutral"}>
                  {group.isActive ? "Active" : "Inactive"}
                </Badge>
              </TableCell>
              <TableCell>
                {confirm === group.id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-neutral-700">Delete?</span>
                    <form action={deleteGroupAction.bind(null, group.id)}>
                      <Button type="submit" variant="destructive" size="sm">
                        Confirm
                      </Button>
                    </form>
                    <Link
                      href="/admin/menu/modifier-groups"
                      className={buttonVariants({ variant: "secondary", size: "sm" })}
                    >
                      Cancel
                    </Link>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/admin/menu/modifier-groups/${group.id}`}
                      className={buttonVariants({ variant: "secondary", size: "sm" })}
                    >
                      Edit
                    </Link>
                    <Link
                      href={`/admin/menu/modifier-groups?confirm=${group.id}`}
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
