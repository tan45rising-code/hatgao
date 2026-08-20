import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatCents } from "@/lib/money";
import { GroupForm } from "../group-form";
import {
  updateGroupAction,
  createModifierAction,
  deleteModifierAction,
  toggleModifierAvailabilityAction,
} from "../actions";

export default async function EditModifierGroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;

  const group = await prisma.modifierGroup.findUnique({
    where: { id },
    include: { modifiers: { where: { deletedAt: null }, orderBy: { sortOrder: "asc" } } },
  });
  if (!group || group.deletedAt) notFound();

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="mb-6 text-lg font-semibold text-neutral-900">Edit {group.name}</h1>
        <GroupForm action={updateGroupAction.bind(null, group.id)} group={group} error={error} />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">Modifiers</h2>
        {group.modifiers.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Extra cost</TableHead>
                <TableHead>Default</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {group.modifiers.map((modifier) => (
                <TableRow key={modifier.id}>
                  <TableCell className="font-medium">{modifier.name}</TableCell>
                  <TableCell className="text-neutral-700">
                    {modifier.priceDeltaCents === 0 ? "Free" : formatCents(modifier.priceDeltaCents)}
                  </TableCell>
                  <TableCell className="text-neutral-700">{modifier.isDefault ? "Yes" : "—"}</TableCell>
                  <TableCell>
                    <form action={toggleModifierAvailabilityAction.bind(null, group.id, modifier.id)}>
                      <button type="submit" className="cursor-pointer">
                        <Badge variant={modifier.isAvailable ? "success" : "neutral"}>
                          {modifier.isAvailable ? "Available" : "Unavailable"}
                        </Badge>
                      </button>
                    </form>
                  </TableCell>
                  <TableCell>
                    <form action={deleteModifierAction.bind(null, group.id, modifier.id)}>
                      <Button type="submit" variant="destructive" size="sm">
                        Delete
                      </Button>
                    </form>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <div className="mt-4 rounded-md border border-neutral-200 bg-white p-4">
          <p className="mb-3 text-sm font-semibold text-neutral-900">Add a modifier</p>
          <form
            action={createModifierAction.bind(null, group.id)}
            className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto]"
          >
            <div>
              <Label htmlFor="modifierName">Name</Label>
              <Input id="modifierName" name="name" required placeholder="Duck" />
            </div>
            <div>
              <Label htmlFor="priceDelta">Extra cost (€, leave as 0 if free)</Label>
              <Input id="priceDelta" name="priceDelta" placeholder="0" className="w-40" />
            </div>
            <div className="flex flex-col justify-end gap-2 pb-0.5">
              <label className="flex items-center gap-2 text-sm text-neutral-800">
                <Checkbox name="isDefault" />
                Selected by default
              </label>
            </div>
            <div className="sm:col-span-3">
              <Button type="submit">Add modifier</Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
