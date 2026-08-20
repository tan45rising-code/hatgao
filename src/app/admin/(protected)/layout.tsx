import type { ReactNode } from "react";
import { auth, signOut } from "@/auth";
import { AdminNav } from "@/components/admin/admin-nav";

/**
 * Shell for every authenticated admin page. Deliberately NOT at
 * `src/app/admin/layout.tsx` — that would also wrap `/admin/login`, and
 * this layout assumes a session exists. `middleware.ts` is the actual
 * gate (it redirects unauthenticated requests before this ever renders);
 * the check below is just type-narrowing belt-and-braces.
 *
 * `text-neutral-900` on the root wrapper is deliberate, not decoration:
 * `globals.css`'s `body { color: var(--foreground) }` flips to a near-white
 * grey under `prefers-color-scheme: dark` (the untouched create-next-app
 * default). The admin was never designed with a dark variant, so anything
 * here that doesn't set its own explicit text color would otherwise
 * silently inherit that near-invisible color on a viewer's dark-mode
 * system — which is exactly what happened to the form fields before they
 * got an explicit color of their own. This is the backstop in case
 * anything else here gets missed.
 */
export default async function ProtectedAdminLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session) return null;

  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/admin/login" });
  }

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-3">
        <span className="text-sm font-semibold text-neutral-900">Hat Gao Admin</span>
        <div className="flex items-center gap-4 text-sm text-neutral-700">
          <span>
            {session.user.name} · {session.user.role}
          </span>
          <form action={handleSignOut}>
            <button type="submit" className="font-medium text-neutral-700 underline hover:text-neutral-900">
              Sign out
            </button>
          </form>
        </div>
      </header>
      {session.user.role === "OWNER" && <AdminNav />}
      <main className="p-6">{children}</main>
    </div>
  );
}
