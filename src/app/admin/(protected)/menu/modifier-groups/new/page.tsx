import { GroupForm } from "../group-form";
import { createGroupAction } from "../actions";

export default async function NewModifierGroupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold text-neutral-900">New modifier group</h1>
      <GroupForm action={createGroupAction} error={error} />
    </div>
  );
}
