import Link from "next/link";
import type { ModifierGroup } from "@prisma/client";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

const ERROR_MESSAGES: Record<string, string> = {
  invalid: "Please check the form — something wasn't valid.",
  range: "Max select can't be lower than min select.",
};

export function GroupForm({
  action,
  group,
  error,
}: {
  action: (formData: FormData) => void | Promise<void>;
  group?: ModifierGroup;
  error?: string;
}) {
  return (
    <form action={action} className="max-w-lg space-y-4">
      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
          {ERROR_MESSAGES[error] ?? "Something went wrong."}
        </p>
      )}

      <div>
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" required defaultValue={group?.name} placeholder="Choose your filling" />
        <p className="mt-1 text-xs text-neutral-500">
          What the customer sees, e.g. &quot;Choose your filling&quot; or &quot;Choose your size&quot;.
        </p>
      </div>
      <div>
        <Label htmlFor="description">Description (optional)</Label>
        <Input id="description" name="description" defaultValue={group?.description ?? ""} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="minSelect">Minimum choices</Label>
          <Input id="minSelect" name="minSelect" type="number" min={0} defaultValue={group?.minSelect ?? 1} />
        </div>
        <div>
          <Label htmlFor="maxSelect">Maximum choices</Label>
          <Input id="maxSelect" name="maxSelect" type="number" min={0} defaultValue={group?.maxSelect ?? 1} />
        </div>
      </div>
      <p className="-mt-2 text-xs text-neutral-500">
        E.g. &quot;choose exactly 1 spice level&quot; is min 1, max 1. &quot;Up to 3 extra
        toppings, all optional&quot; is min 0, max 3.
      </p>
      <label className="flex items-center gap-2 text-sm text-neutral-800">
        <Checkbox name="isRequired" defaultChecked={group?.isRequired ?? true} />
        Required — customer must choose before adding to cart
      </label>
      {group && (
        <label className="flex items-center gap-2 text-sm text-neutral-800">
          <Checkbox name="isActive" defaultChecked={group.isActive} />
          Active
        </label>
      )}

      <details className="rounded-md border border-neutral-200 bg-neutral-50 p-4">
        <summary className="cursor-pointer text-sm font-medium text-neutral-700">
          Advanced (rarely needed)
        </summary>
        <div className="mt-3">
          <Label htmlFor="sortOrder">Display order</Label>
          <Input id="sortOrder" name="sortOrder" type="number" defaultValue={group?.sortOrder ?? 0} />
          <p className="mt-1 text-xs text-neutral-500">
            Where this appears when a product has more than one modifier group — lower numbers
            show first.
          </p>
        </div>
      </details>

      <div className="flex gap-2">
        <Button type="submit">{group ? "Save" : "Create group"}</Button>
        <Link href="/admin/menu/modifier-groups" className={buttonVariants({ variant: "secondary" })}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
