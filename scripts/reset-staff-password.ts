/**
 * Resets an existing staff account's password. The other half of
 * `create-staff-user.ts` — that script only creates (it errors on an
 * email that already exists); there's still no admin UI for this, same
 * as account creation.
 *
 * Usage:
 *   npm run staff:reset-password -- --email=you@hatgaocy.com
 *
 * `--password` can be passed too, but the whole point of the interactive
 * prompt is so a real password never ends up in shell history — omit it
 * and you'll be prompted.
 *
 * Also clears any active lockout (`failedLoginCount`/`lockedUntil`) —
 * if you're resetting because you got locked out after too many wrong
 * guesses, this is the one place that also un-sticks that.
 */

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { prisma } from "../src/server/db";
import { hashPassword } from "../src/server/auth/password";
import { recordAuditLog } from "../src/server/audit/log";

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const arg of argv) {
    const match = /^--([a-zA-Z]+)=(.*)$/.exec(arg);
    if (match) out[match[1]!] = match[2]!;
  }
  return out;
}

async function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const email = (args.email ?? (await prompt("Email: "))).trim().toLowerCase();
  const password = args.password ?? (await prompt("New password (visible — run this locally only): "));

  if (!email || !email.includes("@")) throw new Error("A valid email is required.");
  if (password.length < 8) throw new Error("Password must be at least 8 characters.");

  const existing = await prisma.staffUser.findUnique({ where: { email } });
  if (!existing) throw new Error(`No staff account found for ${email}.`);

  const passwordHash = await hashPassword(password);
  await prisma.staffUser.update({
    where: { id: existing.id },
    data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
  });

  await recordAuditLog({
    actorType: "SYSTEM",
    action: "STAFF_PASSWORD_RESET",
    entityType: "StaffUser",
    entityId: existing.id,
    after: { email: existing.email },
  });

  console.log(`\nPassword updated for ${email} (${existing.role}). Any lockout was cleared too.`);
}

main()
  .catch((err) => {
    console.error(`\nFailed: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
