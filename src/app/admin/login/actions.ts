"use server";

/**
 * The login form action. `signIn()` from `@/auth` handles the redirect to
 * `/admin` on success itself (via `redirectTo`, which internally throws
 * Next's NEXT_REDIRECT — that must NOT be swallowed by the catch below,
 * which is why only `AuthError` is caught and everything else re-thrown).
 *
 * Two distinguishable outcomes from `authorize()` (`src/auth.ts`):
 *   - `TwoFactorRequiredError` (`error.type === "TwoFactorRequired"`) —
 *     the password was right but the account needs a code. Redirect back
 *     to the SAME form with `step=2fa` so it re-renders with the code
 *     field, per the chosen design: re-enter password + code together
 *     rather than a separate short-lived "passed step 1" session.
 *   - everything else (wrong password, wrong code, locked account, unknown
 *     email) — one generic error, on purpose. See the comment in
 *     `src/auth.ts` for why they're not distinguished in the UI.
 *
 * `formData.get("code")` is `null` when the field isn't in the form yet
 * (the first submission, before we know 2FA is needed) — and `signIn()`
 * serializes the credentials via `URLSearchParams` internally, which
 * coerces `null` to the literal 4-character string `"null"`, not an empty
 * value. Without the `?? ""` below, `authorize()` would see a genuinely
 * truthy (if wrong) code on every first-step login against a 2FA account,
 * never reaching the "prompt for a code" branch at all. Cost real time to
 * track down.
 */

import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn, TwoFactorRequiredError } from "@/auth";

export async function loginAction(formData: FormData): Promise<void> {
  const email = formData.get("email");
  try {
    await signIn("credentials", {
      email,
      password: formData.get("password"),
      code: formData.get("code") ?? "",
      redirectTo: "/admin",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      if ((error.type as string) === TwoFactorRequiredError.type) {
        const emailParam = typeof email === "string" ? `&email=${encodeURIComponent(email)}` : "";
        redirect(`/admin/login?step=2fa${emailParam}`);
      }
      redirect("/admin/login?error=1");
    }
    throw error;
  }
}
