import { prisma } from "@/server/db";
import { formatMinutes } from "@/server/menu/availability";
import { updateOpeningHoursAction, addServiceExceptionAction, deleteServiceExceptionAction } from "./actions";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default async function HoursPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const [hours, exceptions] = await Promise.all([
    prisma.openingHours.findMany(),
    prisma.serviceException.findMany({ orderBy: { date: "asc" } }),
  ]);

  const byDay = new Map(hours.map((h) => [h.dayOfWeek, h]));

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="mb-4 text-lg font-semibold text-neutral-900">Opening hours</h1>
        <form action={updateOpeningHoursAction} className="space-y-2">
          {DAY_NAMES.map((name, day) => {
            const row = byDay.get(day);
            return (
              <div key={day} className="flex items-center gap-3 rounded-md border border-neutral-200 px-3 py-2">
                <span className="w-24 text-sm font-medium text-neutral-900">{name}</span>
                <label className="flex items-center gap-1 text-xs text-neutral-600">
                  <input type="checkbox" name={`isClosed-${day}`} defaultChecked={row?.isClosed ?? false} />
                  Closed
                </label>
                <input
                  type="time"
                  name={`opensAt-${day}`}
                  defaultValue={formatMinutes(row?.opensAt ?? 720)}
                  className="rounded border border-neutral-300 px-2 py-1 text-sm"
                />
                <span className="text-neutral-400">to</span>
                <input
                  type="time"
                  name={`closesAt-${day}`}
                  defaultValue={formatMinutes(row?.closesAt ?? 1320)}
                  className="rounded border border-neutral-300 px-2 py-1 text-sm"
                />
              </div>
            );
          })}
          <button
            type="submit"
            className="mt-2 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Save hours
          </button>
        </form>
      </div>

      <div>
        <h2 className="mb-4 text-lg font-semibold text-neutral-900">One-off exceptions</h2>
        {error === "duplicate_exception" && (
          <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-800">
            That date already has an exception — delete it first if you want to change it.
          </p>
        )}

        <ul className="mb-4 space-y-2">
          {exceptions.map((ex) => (
            <li
              key={ex.id}
              className="flex items-center justify-between rounded-md border border-neutral-200 px-3 py-2 text-sm"
            >
              <span>
                {ex.date.toISOString().slice(0, 10)} —{" "}
                {ex.isClosed ? "Closed" : `${formatMinutes(ex.opensAt ?? 0)}–${formatMinutes(ex.closesAt ?? 0)}`}
                {ex.note && <span className="text-neutral-500"> ({ex.note})</span>}
              </span>
              <form action={deleteServiceExceptionAction}>
                <input type="hidden" name="id" value={ex.id} />
                <button type="submit" className="text-xs font-medium text-red-600 hover:text-red-800">
                  Delete
                </button>
              </form>
            </li>
          ))}
          {exceptions.length === 0 && <p className="text-sm text-neutral-500">No exceptions.</p>}
        </ul>

        <form action={addServiceExceptionAction} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs text-neutral-600">Date</label>
            <input type="date" name="date" required className="rounded border border-neutral-300 px-2 py-1 text-sm" />
          </div>
          <label className="flex items-center gap-1 text-xs text-neutral-600">
            <input type="checkbox" name="isClosed" defaultChecked />
            Closed all day
          </label>
          <div>
            <label className="mb-1 block text-xs text-neutral-600">Opens</label>
            <input type="time" name="opensAt" className="rounded border border-neutral-300 px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-600">Closes</label>
            <input type="time" name="closesAt" className="rounded border border-neutral-300 px-2 py-1 text-sm" />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs text-neutral-600">Note</label>
            <input name="note" placeholder="e.g. Bank holiday" className="w-full rounded border border-neutral-300 px-2 py-1 text-sm" />
          </div>
          <button
            type="submit"
            className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Add
          </button>
        </form>
      </div>
    </div>
  );
}
