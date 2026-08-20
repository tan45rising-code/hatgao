"use client";

/**
 * The availability dropdown in the product list. Submits the moment a new
 * status is chosen — no separate "Update" button — and recolors itself
 * immediately so the change is obvious without waiting on the round trip.
 *
 * Deliberately UNCONTROLLED for the actual select value (`defaultValue`,
 * not `value`). An earlier version made this a controlled component
 * (`value={state}`) and, while testing, that produced a real, repeatable
 * bug: after this select's own auto-submit revalidates the page and hands
 * this component a fresh `defaultValue`, the visible selected option text
 * could end up disagreeing with its own color — e.g. showing "Available"
 * in the red "sold out" styling. Neither a `useEffect` resync nor a
 * remount-via-`key` closed the gap reliably.
 *
 * The robust fix is to stop asking React to own the select's displayed
 * value at all. Uncontrolled means the browser's own native select state
 * is the single source of truth for what's shown — it updates the instant
 * the user picks an option and can never disagree with itself, because
 * nothing external is fighting to reconcile it. The color is a separate,
 * purely cosmetic piece of local state read in `handleChange`, not tied to
 * the select's `value` prop, so it can't desync the *displayed text*
 * either way.
 */

import { useState, type ChangeEvent } from "react";
import { cn } from "@/lib/utils";
import type { AvailabilityStatus } from "@/app/admin/(protected)/menu/products/actions";

const STATUS_OPTIONS: { value: AvailabilityStatus; label: string }[] = [
  { value: "available", label: "Available" },
  { value: "sold_out_today", label: "Sold out for today" },
  { value: "unavailable", label: "Unavailable" },
];

const STATUS_STYLES: Record<AvailabilityStatus, string> = {
  available: "border-green-300 bg-green-50 text-green-900",
  sold_out_today: "border-red-300 bg-red-50 text-red-900",
  unavailable: "border-red-300 bg-red-50 text-red-900",
};

export function StatusSelect({ defaultValue }: { defaultValue: AvailabilityStatus }) {
  const [color, setColor] = useState<AvailabilityStatus>(defaultValue);

  function handleChange(e: ChangeEvent<HTMLSelectElement>) {
    setColor(e.target.value as AvailabilityStatus);
    e.target.form?.requestSubmit();
  }

  return (
    <select
      name="status"
      defaultValue={defaultValue}
      onChange={handleChange}
      className={cn(
        "rounded-md border px-2 py-1.5 text-xs font-semibold focus:outline-none",
        STATUS_STYLES[color],
      )}
    >
      {STATUS_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
