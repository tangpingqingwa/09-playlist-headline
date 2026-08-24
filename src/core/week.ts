/**
 * Public board window is rolling last 7 days from first paid placement.
 * ISO `weekId` (`YYYY-Www`) remains a Monday 00:00 UTC Polar/audit label.
 * Rank does not expire at civil Monday midnight.
 */

export type UtcWeek = {
  weekId: string;
  startsAt: Date;
  endsAt: Date;
  nextResetAt: Date;
};

const DAY_MS = 86_400_000;
/** Inclusive length of the public week window. Not a Monday midnight bucket. */
export const ROLLING_WEEK_MS = 7 * DAY_MS;

/** Split so Next/webpack cannot replace `process.env.WEEK_NOW` at build time. */
const WEEK_NOW_KEY = ["WEEK", "NOW"].join("_");

/**
 * Operator / test clock. `WEEK_NOW` is an ISO-8601 instant.
 * Live rank is a rolling last-7-days filter on `firstPaidAt`, not a delete.
 */
export function nowUtc(env: NodeJS.ProcessEnv = process.env): Date {
  const raw = env[WEEK_NOW_KEY];
  if (raw === undefined || raw.trim() === "") {
    return new Date();
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`invalid ${WEEK_NOW_KEY}: ${raw}`);
  }
  return parsed;
}

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

/**
 * Next Monday 00:00 UTC. ISO `weekId` label boundary, not public rank expiry.
 * A Monday midnight instant already opened this ISO week label.
 */
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

/** Inclusive start of the rolling last-7-days window. Not civil midnight. */
export function rollingWeekStart(now: Date = nowUtc()): Date {
  return new Date(now.getTime() - ROLLING_WEEK_MS);
}

/** Paid placement still inside the rolling last-7-days window. */
export function bidInRollingWeek(
  paidAt: string,
  now: Date = nowUtc(),
): boolean {
  const paid = Date.parse(paidAt);
  if (Number.isNaN(paid)) {
    return false;
  }
  const t = now.getTime();
  return paid >= t - ROLLING_WEEK_MS && paid <= t;
}

export function currentWeekUtc(now: Date = nowUtc()): UtcWeek {
  const weekId = isoWeekId(now);
  const startsAt = rollingWeekStart(now);
  const endsAt = new Date(now.getTime() + 1);
  return { weekId, startsAt, endsAt, nextResetAt: nextMondayUtc(now) };
}
