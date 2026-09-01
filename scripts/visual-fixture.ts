import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createStore, type Store } from "../src/core/store";
import type { Listing } from "../src/core/rank";

export const VISUAL_FIXTURE_NOW = "2026-08-28T12:00:00.000Z";
export const VISUAL_FIXTURE_WEEK = "2026-W35";

type FixtureRow = {
  id: string;
  sessionId: string;
  track: string;
  artist: string;
  listenUrl: string;
  amountUsd: number;
  paidAt: string;
  clicks: number;
};

/**
 * Private, disposable occupied-board data. These are original labels and
 * stable public URLs used only to exercise the visual surface; no production
 * database is touched unless the caller explicitly supplies its path.
 */
export const VISUAL_FIXTURE_ROWS: readonly FixtureRow[] = [
  {
    id: "lst_visual_one",
    sessionId: "visual-session-one",
    track: "Midnight Frequency",
    artist: "Signal Studio",
    listenUrl: "https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl",
    amountUsd: 17000,
    paidAt: "2026-08-25T12:00:00.000Z",
    clicks: 148,
  },
  {
    id: "lst_visual_two",
    sessionId: "visual-session-two",
    track: "Canvas Night Drive",
    artist: "Canvas Radio",
    listenUrl: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC",
    amountUsd: 16000,
    paidAt: "2026-08-24T12:00:00.000Z",
    clicks: 92,
  },
  {
    id: "lst_visual_three",
    sessionId: "visual-session-three",
    track: "First Light Mix",
    artist: "Morrow",
    listenUrl: "https://open.spotify.com/track/7ouMYWpwJ422jRcDASZBJu",
    amountUsd: 14028,
    paidAt: "2026-08-23T12:00:00.000Z",
    clicks: 64,
  },
  {
    id: "lst_visual_four",
    sessionId: "visual-session-four",
    track: "Low Tide Session",
    artist: "Low Tide",
    listenUrl: "https://open.spotify.com/track/1301WleyT98MSxVHPZCA6M",
    amountUsd: 13005,
    paidAt: "2026-08-22T12:00:00.000Z",
    clicks: 48,
  },
  {
    id: "lst_visual_five",
    sessionId: "visual-session-five",
    track: "Sunday Side A",
    artist: "Sunday Side A",
    listenUrl: "https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b",
    amountUsd: 12080,
    paidAt: "2026-08-21T12:00:00.000Z",
    clicks: 27,
  },
  {
    id: "lst_visual_six",
    sessionId: "visual-session-six",
    track: "Paper Planes",
    artist: "Paper Planes",
    listenUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    amountUsd: 11004,
    paidAt: "2026-08-21T18:00:00.000Z",
    clicks: 12,
  },
];

function normalizeListingIds(store: Store, rows: readonly Listing[]): void {
  /* Settlement owns listing creation; this fixture-only post-step gives fresh
     captures stable IDs without changing the production Store implementation. */
  store.db.pragma("foreign_keys = OFF");
  try {
    for (const [index, listing] of rows.entries()) {
      const target = VISUAL_FIXTURE_ROWS[index];
      if (!target) continue;
      store.db.prepare("UPDATE payments SET listing_id = ? WHERE listing_id = ?")
        .run(target.id, listing.id);
      store.db.prepare("UPDATE clicks SET listing_id = ? WHERE listing_id = ?")
        .run(target.id, listing.id);
      store.db.prepare("UPDATE listings SET id = ? WHERE id = ?")
        .run(target.id, listing.id);
    }
  } finally {
    store.db.pragma("foreign_keys = ON");
  }
}

function seedClicks(store: Store): void {
  for (const row of VISUAL_FIXTURE_ROWS) {
    store.db.prepare(
      "INSERT INTO clicks (listing_id, count) VALUES (?, ?) ON CONFLICT(listing_id) DO UPDATE SET count = excluded.count",
    ).run(row.id, row.clicks);
  }
}

export function seedVisualFixture(databasePath: string): Listing[] {
  const path = resolve(databasePath);
  mkdirSync(dirname(path), { recursive: true });
  const previousWeekNow = process.env.WEEK_NOW;
  const previousMode = process.env.WAFFO_MODE;
  process.env.WEEK_NOW = VISUAL_FIXTURE_NOW;
  process.env.WAFFO_MODE = "fixture";
  const store = createStore(path);
  try {
    store.reset();
    const settled = VISUAL_FIXTURE_ROWS.map((row) => store.applyPaidEvent({
      sessionId: row.sessionId,
      weekId: VISUAL_FIXTURE_WEEK,
      track: row.track,
      artist: row.artist,
      listenUrl: row.listenUrl,
      amountUsd: row.amountUsd,
      paidAt: row.paidAt,
      kind: "create",
    }));
    normalizeListingIds(store, settled);
    seedClicks(store);
    return store.listPaidInRollingWeek(new Date(VISUAL_FIXTURE_NOW));
  } finally {
    store.close();
    if (previousWeekNow === undefined) delete process.env.WEEK_NOW;
    else process.env.WEEK_NOW = previousWeekNow;
    if (previousMode === undefined) delete process.env.WAFFO_MODE;
    else process.env.WAFFO_MODE = previousMode;
  }
}

function runFromCli(): void {
  const requested = process.argv[2] ?? process.env.DATABASE_PATH;
  if (!requested || requested === ":memory:") {
    throw new Error("visual fixture requires a disposable file-backed DATABASE_PATH");
  }
  const path = resolve(requested);
  if (existsSync(path) && path === resolve("data", "playlist.db")) {
    throw new Error("refusing to seed the shared production database");
  }
  const rows = seedVisualFixture(path);
  for (const row of rows) {
    process.stdout.write(`${row.id}\t${row.track}\t${row.bidUsd}\t${row.clicks}\n`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runFromCli();
}
