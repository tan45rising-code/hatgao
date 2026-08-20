import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { auth } from "@/auth";
import { prisma } from "@/server/db";
import { generateTotpSecret, buildOtpAuthUri } from "@/server/auth/totp";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { readPendingRecoveryCodesCookie } from "./pending-codes-cookie";
import { confirmTotpAction, acknowledgeRecoveryCodesAction } from "./actions";

/** Grouped in 4s for readability: "JBSW Y3DP EHPK 3PXP" instead of one run. */
function formatSecretForDisplay(secret: string): string {
  return secret.match(/.{1,4}/g)?.join(" ") ?? secret;
}

export default async function TwoFactorSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/admin/login");

  const staff = await prisma.staffUser.findUnique({ where: { id: session.user.id } });
  if (!staff) redirect("/admin/login");

  const { error } = await searchParams;

  // ---- state 1: freshly enrolled, showing the one-time recovery codes ----
  const pendingCodes = await readPendingRecoveryCodesCookie(staff.id);
  if (pendingCodes) {
    return (
      <div className="mx-auto max-w-lg">
        <h1 className="text-lg font-semibold text-neutral-900">Save your recovery codes</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Two-factor authentication is now enabled. Each code below works once, and this is the
          only time they&apos;ll be shown. Save them somewhere safe — a password manager, or
          printed and locked away. If you lose your authenticator device, a recovery code is the
          only way back into this account.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2 rounded-md border border-neutral-200 bg-neutral-50 p-4 font-mono text-sm text-neutral-900">
          {pendingCodes.map((code) => (
            <div key={code}>{code}</div>
          ))}
        </div>
        <form action={acknowledgeRecoveryCodesAction} className="mt-6">
          <Button type="submit">I&apos;ve saved these codes</Button>
        </form>
      </div>
    );
  }

  // ---- state 2: already enrolled (viewing this page again later) ----
  if (staff.twoFactorEnabled) {
    return (
      <div className="mx-auto max-w-lg">
        <h1 className="text-lg font-semibold text-neutral-900">Two-factor authentication</h1>
        <p className="mt-2 text-sm text-neutral-700">
          Enabled for {staff.email}. {staff.twoFactorRecoveryCodeHashes.length} recovery code
          {staff.twoFactorRecoveryCodeHashes.length === 1 ? "" : "s"} remaining.
        </p>
      </div>
    );
  }

  // ---- state 3: not yet enrolled — generate (or reuse) an unconfirmed secret ----
  let secret = staff.twoFactorSecret;
  if (!secret) {
    secret = generateTotpSecret();
    await prisma.staffUser.update({ where: { id: staff.id }, data: { twoFactorSecret: secret } });
  }

  const otpAuthUri = buildOtpAuthUri(secret, staff.email);
  const qrDataUrl = await QRCode.toDataURL(otpAuthUri);

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-lg font-semibold text-neutral-900">Set up two-factor authentication</h1>
      <p className="mt-1 text-sm text-neutral-600">
        Required for OWNER accounts. Scan this with an authenticator app (Google Authenticator,
        1Password, Authy — anything that supports TOTP), then enter the 6-digit code it shows.
      </p>

      {error && (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
          That code didn&apos;t match. Codes refresh every 30 seconds — try the current one.
        </p>
      )}

      {/* eslint-disable-next-line @next/next/no-img-element -- server-generated data: URI, not an optimizable remote image */}
      <img src={qrDataUrl} alt="Scan with your authenticator app" className="mt-4 h-48 w-48" />

      <p className="mt-3 text-xs text-neutral-600">Can&apos;t scan? Enter this key manually:</p>
      <p className="mt-1 rounded-md bg-neutral-50 px-3 py-2 font-mono text-sm text-neutral-900">
        {formatSecretForDisplay(secret)}
      </p>

      <form action={confirmTotpAction} className="mt-6 space-y-3">
        <div className="max-w-[10rem]">
          <Label htmlFor="code">6-digit code</Label>
          <Input id="code" name="code" type="text" inputMode="numeric" autoComplete="one-time-code" required />
        </div>
        <Button type="submit">Confirm and enable</Button>
      </form>
    </div>
  );
}
