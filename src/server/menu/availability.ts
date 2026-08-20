/**
 * Opening hours and service availability.
 *
 * Times are stored as minutes since midnight (720 = 12:00, 1350 = 22:30) in
 * the restaurant's own timezone. Integers compare cleanly and sidestep every
 * DST and string-parsing trap that "22:30" invites.
 *
 * All reasoning is done in the restaurant's local time, derived from a UTC
 * instant via Intl — never from the server's own clock settings, which on a
 * cloud host are UTC and would put Hat Gao's closing time three hours early.
 */

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday

export type OpeningHoursRow = {
  dayOfWeek: DayOfWeek;
  opensAt: number;
  closesAt: number;
  isClosed: boolean;
};

export type ServiceExceptionRow = {
  /** "YYYY-MM-DD" in the restaurant's local timezone. */
  date: string;
  isClosed: boolean;
  opensAt?: number | null;
  closesAt?: number | null;
  note?: string | null;
};

export type AvailabilityConfig = {
  timezone: string;
  hours: OpeningHoursRow[];
  exceptions?: ServiceExceptionRow[];
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  /**
   * Stop accepting orders this many minutes before closing, so the kitchen
   * isn't still cooking after the doors shut. Defaults to the prep time.
   */
  lastOrderBufferMinutes: number;
};

export type LocalMoment = {
  dayOfWeek: DayOfWeek;
  minutesSinceMidnight: number;
  dateKey: string; // YYYY-MM-DD, local
};

/**
 * Convert a UTC instant into the restaurant's local day and time.
 * Uses Intl so DST is handled by the platform's tz database rather than
 * by us guessing at offsets.
 */
export function toLocalMoment(instant: Date, timezone: string): LocalMoment {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = fmt.formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";

  const weekdayMap: Record<string, DayOfWeek> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };

  const hour = Number(get("hour"));
  const minute = Number(get("minute"));

  return {
    dayOfWeek: weekdayMap[get("weekday")] ?? 0,
    // Intl can render midnight as "24" in some locales/engines.
    minutesSinceMidnight: (hour === 24 ? 0 : hour) * 60 + minute,
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

export type ServiceAvailability = {
  isOpen: boolean;
  acceptingOrders: boolean;
  deliveryAvailable: boolean;
  pickupAvailable: boolean;
  reason?:
    | "CLOSED_TODAY"
    | "BEFORE_OPENING"
    | "AFTER_CLOSING"
    | "TOO_CLOSE_TO_CLOSING"
    | "SERVICE_DISABLED";
  /** Local minutes-since-midnight after which we stop taking orders. */
  lastOrderAt?: number;
  opensAt?: number;
  closesAt?: number;
  note?: string;
};

export function getAvailability(
  instant: Date,
  config: AvailabilityConfig,
): ServiceAvailability {
  const local = toLocalMoment(instant, config.timezone);

  const exception = config.exceptions?.find((e) => e.date === local.dateKey);
  const regular = config.hours.find((h) => h.dayOfWeek === local.dayOfWeek);

  let opensAt: number | undefined;
  let closesAt: number | undefined;
  let closedToday = false;
  let note: string | undefined;

  if (exception) {
    note = exception.note ?? undefined;
    if (exception.isClosed) {
      closedToday = true;
    } else {
      opensAt = exception.opensAt ?? regular?.opensAt;
      closesAt = exception.closesAt ?? regular?.closesAt;
    }
  } else if (!regular || regular.isClosed) {
    closedToday = true;
  } else {
    opensAt = regular.opensAt;
    closesAt = regular.closesAt;
  }

  const shut = (reason: ServiceAvailability["reason"]): ServiceAvailability => ({
    isOpen: false,
    acceptingOrders: false,
    deliveryAvailable: false,
    pickupAvailable: false,
    reason,
    ...(opensAt !== undefined ? { opensAt } : {}),
    ...(closesAt !== undefined ? { closesAt } : {}),
    ...(note ? { note } : {}),
  });

  if (closedToday || opensAt === undefined || closesAt === undefined) {
    return shut("CLOSED_TODAY");
  }

  const now = local.minutesSinceMidnight;
  if (now < opensAt) return shut("BEFORE_OPENING");
  if (now >= closesAt) return shut("AFTER_CLOSING");

  const lastOrderAt = closesAt - config.lastOrderBufferMinutes;
  if (now >= lastOrderAt) {
    return { ...shut("TOO_CLOSE_TO_CLOSING"), isOpen: true, lastOrderAt };
  }

  if (!config.deliveryEnabled && !config.pickupEnabled) {
    return { ...shut("SERVICE_DISABLED"), isOpen: true, lastOrderAt };
  }

  return {
    isOpen: true,
    acceptingOrders: true,
    deliveryAvailable: config.deliveryEnabled,
    pickupAvailable: config.pickupEnabled,
    lastOrderAt,
    opensAt,
    closesAt,
    ...(note ? { note } : {}),
  };
}

/**
 * Prep time to quote when accepting an order.
 *
 * This feeds `min_preparation_time_minutes` on the Wolt delivery, which is
 * what the Venue Lateness Fee is measured against (€1.00 at 10 minutes late,
 * then €0.10/min). Quoting 30 and being ready in 25 costs nothing. Quoting
 * 25 and taking 30 costs money AND leaves a courier standing in the doorway.
 *
 * So: round up, and lean on the peak figure during the busy window.
 */
export type PrepTimeConfig = {
  defaultPrepMinutes: number;
  peakPrepMinutes: number;
  /** Local minutes-since-midnight ranges considered peak. */
  peakWindows: Array<{ from: number; to: number }>;
  timezone: string;
};

export const DEFAULT_PEAK_WINDOWS = [
  { from: 12 * 60, to: 14 * 60 + 30 }, // lunch
  { from: 18 * 60 + 30, to: 21 * 60 + 30 }, // dinner
];

export function suggestedPrepMinutes(instant: Date, config: PrepTimeConfig): number {
  const local = toLocalMoment(instant, config.timezone);
  const inPeak = config.peakWindows.some(
    (w) => local.minutesSinceMidnight >= w.from && local.minutesSinceMidnight < w.to,
  );
  return inPeak ? config.peakPrepMinutes : config.defaultPrepMinutes;
}

/** Format minutes-since-midnight for display. 1350 → "22:30". */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
