/**
 * Creates a staff account. There's no self-registration and no admin UI
 * for this yet (that's Slice 3) — this is how you create the first OWNER
 * account, and how you'll create any staff account until the UI exists.
 *
 * Usage:
 *   npm run staff:create -- --email=you@hatgao.com.cy --name="Tan" --role=OWNER --password=...
 *
 * Any of --email / --name / --password can be omitted and you'll be
 * prompted for them instead (useful so a password never ends up in your
 * shell history). --role defaults to STAFF; pass --role=OWNER explicitly.
 *
 * Hashes with the same argon2id helper the login path verifies against
 * (src/server/auth/password.ts) and writes through Prisma Client, not raw
 * SQL — sidesteps the `@updatedAt`-has-no-DB-default trap documented in
 * prisma/verify/002_seed_menu.sql.
 */

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import type { StaffRole } from "@prisma/client";
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
  const name = args.name ?? (await prompt("Name: "));
  const roleInput = (args.role ?? "STAFF").toUpperCase();
  const password = args.password ?? (await prompt("Password (visible — run this locally only): "));

  if (roleInput !== "OWNER" && roleInput !== "STAFF") {
    throw new Error(`--role must be OWNER or STAFF, got "${roleInput}"`);
  }
  const role = roleInput as StaffRole;

  if (!email || !email.includes("@")) throw new Error("A valid email is required.");
  if (!name) throw new Error("A name is required.");
  if (password.length < 8) throw new Error("Password must be at least 8 characters.");

  const existing = await prisma.staffUser.findUnique({ where: { email } });
  if (existing) throw new Error(`A staff account already exists for ${email}.`);

  const passwordHash = await hashPassword(password);
  const staff = await prisma.staffUser.create({
    data: { email, name, role, passwordHash },
  });

  await recordAuditLog({
    actorType: "SYSTEM",
    action: "STAFF_CREATED",
    entityType: "StaffUser",
    entityId: staff.id,
    after: { email: staff.email, name: staff.name, role: staff.role },
  });

  console.log(`\nCreated ${role} account for ${email} (id: ${staff.id}).`);
  if (role === "OWNER") {
    console.log(
      "\nNOTE: 2FA is not enforced yet (that's Slice 2) — this OWNER account is password-only for now.",
    );
  }
}

main()
  .catch((err) => {
    console.error(`\nFailed: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
