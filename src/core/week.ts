/** ISO week in UTC (`YYYY-Www`). Monday 00:00:00.000 UTC starts the new week. */

export type UtcWeek = {
  weekId: string;
  startsAt: Date;
  endsAt: Date;
  nextResetAt: Date;
};

const DAY_MS = 86_400_000;

export function isoWeekId(now: Date): string {
  const cursor = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const day = cursor.getUTCDay() || 7;
  cursor.setUTCDate(cursor.getUTCDate() + 4 - day);
  const isoYear = cursor.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(
    ((cursor.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7,
  );
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

export function isoWeekMondayUtc(weekId: string): Date {
  const match = /^(\d{4})-W(\d{2})$/.exec(weekId);
  if (!match) {
    throw new Error(`invalid weekId: ${weekId}`);
  }
  const year = Number(match[1]);
  const week = Number(match[2]);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));
  return new Date(week1Monday.getTime() + (week - 1) * 7 * DAY_MS);
}

/** Next Monday 00:00 UTC. A Monday midnight instant already opened this week. */
export function nextMondayUtc(now: Date): Date {
  const startOfToday = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const day = now.getUTCDay();
  if (day === 1) {
    return new Date(startOfToday + 7 * DAY_MS);
  }
  const daysUntilMonday = (8 - day) % 7;
  return new Date(startOfToday + daysUntilMonday * DAY_MS);
}

export function currentWeekUtc(now: Date = new Date()): UtcWeek {
  const weekId = isoWeekId(now);
  const startsAt = isoWeekMondayUtc(weekId);
  const endsAt = nextMondayUtc(now);
  return { weekId, startsAt, endsAt, nextResetAt: endsAt };
}
