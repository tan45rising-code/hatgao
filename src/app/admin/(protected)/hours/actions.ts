"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/server/db";
import { recordAuditLog } from "@/server/audit/log";
import { parseHHMM } from "@/lib/time";

async function requireOwner() {
  const session = await auth();
  if (!session) redirect("/admin/login");
  return session;
}

const dayRowSchema = z.object({
  dayOfWeek: z.coerce.number().int().min(0).max(6),
  opensAt: z.string(),
  closesAt: z.string(),
  isClosed: z.coerce.boolean(),
});

export async function updateOpeningHoursAction(formData: FormData): Promise<void> {
  const session = await requireOwner();

  const rows = [0, 1, 2, 3, 4, 5, 6].map((day) => {
    const parsed = dayRowSchema.parse({
      dayOfWeek: day,
      opensAt: formData.get(`opensAt-${day}`) ?? "12:00",
      closesAt: formData.get(`closesAt-${day}`) ?? "22:00",
      isClosed: formData.get(`isClosed-${day}`) === "on",
    });
    return {
      dayOfWeek: parsed.dayOfWeek,
      opensAt: parseHHMM(parsed.opensAt),
      closesAt: parseHHMM(parsed.closesAt),
      isClosed: parsed.isClosed,
    };
  });

  await prisma.$transaction(
    rows.map((row) =>
      prisma.openingHours.upsert({
        where: { dayOfWeek: row.dayOfWeek },
        update: { opensAt: row.opensAt, closesAt: row.closesAt, isClosed: row.isClosed },
        create: row,
      }),
    ),
  );

  await recordAuditLog({
    actorType: "STAFF",
    actorId: session.user.id,
    action: "OPENING_HOURS_UPDATED",
    entityType: "OpeningHours",
    after: { rows },
  });

  revalidatePath("/admin/hours");
}

const exceptionSchema = z.object({
  date: z.string().min(1, "Date is required"),
  isClosed: z.coerce.boolean(),
  opensAt: z.string().optional(),
  closesAt: z.string().optional(),
  note: z.string().trim().optional(),
});

export async function addServiceExceptionAction(formData: FormData): Promise<void> {
  const session = await requireOwner();

  const parsed = exceptionSchema.parse({
    date: formData.get("date"),
    isClosed: formData.get("isClosed") === "on",
    opensAt: formData.get("opensAt") || undefined,
    closesAt: formData.get("closesAt") || undefined,
    note: formData.get("note") || undefined,
  });

  try {
    await prisma.serviceException.create({
      data: {
        date: new Date(`${parsed.date}T00:00:00Z`),
        isClosed: parsed.isClosed,
        opensAt: parsed.isClosed || !parsed.opensAt ? null : parseHHMM(parsed.opensAt),
        closesAt: parsed.isClosed || !parsed.closesAt ? null : parseHHMM(parsed.closesAt),
        note: parsed.note ?? null,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      redirect("/admin/hours?error=duplicate_exception");
    }
    throw err;
  }

  await recordAuditLog({
    actorType: "STAFF",
    actorId: session.user.id,
    action: "SERVICE_EXCEPTION_ADDED",
    entityType: "ServiceException",
    after: parsed,
  });

  revalidatePath("/admin/hours");
}

export async function deleteServiceExceptionAction(formData: FormData): Promise<void> {
  const session = await requireOwner();
  const id = String(formData.get("id"));

  await prisma.serviceException.delete({ where: { id } });

  await recordAuditLog({
    actorType: "STAFF",
    actorId: session.user.id,
    action: "SERVICE_EXCEPTION_DELETED",
    entityType: "ServiceException",
    entityId: id,
  });

  revalidatePath("/admin/hours");
}
