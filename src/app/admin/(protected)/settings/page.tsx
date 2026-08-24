import { getSettings } from "@/server/settings/get-settings";
import { formatCents } from "@/lib/money";
import { updateSettingsAction } from "./actions";

export default async function SettingsPage() {
  const settings = await getSettings();

  return (
    <div className="max-w-md">
      <h1 className="mb-4 text-lg font-semibold text-neutral-900">Service settings</h1>
      <form action={updateSettingsAction} className="space-y-4">
        <label className="flex items-center gap-2 text-sm text-neutral-900">
          <input type="checkbox" name="pickupEnabled" defaultChecked={settings.pickupEnabled} />
          Accepting pickup orders
        </label>

        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-900">Minimum order for pickup</label>
          <input
            name="minOrderPickup"
            defaultValue={(settings.minOrderPickupCents / 100).toFixed(2)}
            className="rounded border border-neutral-300 px-2 py-1.5 text-sm"
          />
          <p className="mt-1 text-xs text-neutral-500">Currently {formatCents(settings.minOrderPickupCents)}</p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-900">Default prep time (minutes)</label>
          <input
            type="number"
            name="defaultPrepMinutes"
            defaultValue={settings.defaultPrepMinutes}
            className="rounded border border-neutral-300 px-2 py-1.5 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-900">Peak prep time (minutes)</label>
          <input
            type="number"
            name="peakPrepMinutes"
            defaultValue={settings.peakPrepMinutes}
            className="rounded border border-neutral-300 px-2 py-1.5 text-sm"
          />
          <p className="mt-1 text-xs text-neutral-500">
            Used for lunch (12:00–14:30) and dinner (18:30–21:30) automatically.
          </p>
        </div>

        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Save settings
        </button>
      </form>
    </div>
  );
}
