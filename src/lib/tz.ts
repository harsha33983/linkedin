/**
 * Timezone helpers for scheduling.
 *
 * The UI asks users for a wall-clock time in an IANA timezone (e.g. 09:00
 * Asia/Kolkata). This converts that wall-clock time into the correct UTC
 * instant so the server can fire the job at the right moment regardless of
 * the machine/browser timezone.
 */

/** Default scheduling timezone (product default from the spec). */
export const DEFAULT_SCHEDULE_TZ = "Asia/Kolkata";

/**
 * Convert a wall-clock time in `timeZone` to the equivalent UTC Date.
 *
 * The wall-clock fields (year/month/day/hour/minute from `dateStr` + `time`)
 * are interpreted AS IF THEY WERE in `timeZone` — never in the machine's
 * local timezone — and converted to the correct UTC instant.
 *
 * @param dateStr local calendar date, "YYYY-MM-DD"
 * @param time    local wall-clock time, "HH:mm"
 * @param timeZone IANA timezone id (e.g. "Asia/Kolkata", "America/New_York")
 */
export function zonedTimeToUtc(dateStr: string, time: string, timeZone: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);

  // Desired wall-clock reading in `timeZone`, expressed as if it were UTC.
  const target = Date.UTC(year, month - 1, day, hour, minute);

  /** Offset (wall − utc) in ms of a given UTC instant in `timeZone`. */
  const offsetAt = (utcMs: number): number => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(new Date(utcMs));

    const values: Record<string, number> = {};
    for (const part of parts) {
      if (part.type !== "literal") values[part.type] = Number(part.value);
    }
    // Some engines report midnight as hour 24 with hour12:false.
    const h = values.hour === 24 ? 0 : values.hour;
    return Date.UTC(values.year, values.month - 1, values.day, h, values.minute, values.second || 0) - utcMs;
  };

  // Solve utc such that utc + offset(utc) === target. Two passes converge on
  // the correct offset even across DST transitions.
  let utc = target - offsetAt(target);
  let off = offsetAt(utc);
  utc = target - off;
  const refinedOff = offsetAt(utc);
  if (refinedOff !== off) {
    utc = target - refinedOff;
  }

  return new Date(utc);
}

/** Format a local Date into "YYYY-MM-DD" for zonedTimeToUtc. */
export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
