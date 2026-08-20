import { auth } from "@/auth";

/**
 * Placeholder landing page — proves the login → session → protected route
 * loop works end to end. This is NOT the Phase 3 kitchen order board;
 * that's a separate, later piece of work. Menu CRUD (Slice 3) will add
 * real navigation here.
 */
export default async function AdminHomePage() {
  const session = await auth();
  if (!session) return null;

  return (
    <div>
      <h1 className="text-lg font-semibold text-neutral-900">Welcome, {session.user.name}</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Signed in as <span className="font-medium">{session.user.email}</span> with role{" "}
        <span className="font-medium">{session.user.role}</span>.
      </p>
    </div>
  );
}
