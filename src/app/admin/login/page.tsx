import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { loginAction } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; step?: string; email?: string }>;
}) {
  const { error, step, email } = await searchParams;
  const needsCode = step === "2fa";

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 text-neutral-900">
      <div className="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold text-neutral-900">Hat Gao — Staff Login</h1>
        <p className="mb-6 text-sm text-neutral-600">
          {needsCode ? "Enter your authentication code to finish signing in." : "Sign in to the admin dashboard."}
        </p>

        {error && (
          <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
            Invalid email or password, or this account is temporarily locked.
          </p>
        )}

        <form action={loginAction} className="space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="username"
              defaultValue={email}
            />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" required autoComplete="current-password" />
          </div>
          {needsCode && (
            <div>
              <Label htmlFor="code">Authentication code</Label>
              <Input
                id="code"
                name="code"
                type="text"
                inputMode="text"
                autoComplete="one-time-code"
                autoFocus
                placeholder="6-digit code, or a recovery code"
              />
              <p className="mt-1 text-xs text-neutral-500">
                From your authenticator app, or one of your saved recovery codes.
              </p>
            </div>
          )}
          <Button type="submit" className="w-full">
            Sign in
          </Button>
        </form>
      </div>
    </main>
  );
}
