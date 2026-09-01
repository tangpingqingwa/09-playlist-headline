import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import HomePage from "../src/app/page";
import { rankListings } from "../src/core/rank";
import { createStore } from "../src/core/store";
import {
  VISUAL_FIXTURE_NOW,
  VISUAL_FIXTURE_ROWS,
  VISUAL_FIXTURE_WEEK,
  seedVisualFixture,
} from "../scripts/visual-fixture";

const { Board } = HomePage;
const root = process.cwd();
const pageSource = readFileSync(join(root, "src", "app", "page.tsx"), "utf8");
const viewModelSource = readFileSync(join(root, "src", "app", "home-view-model.ts"), "utf8");
const fixtureSource = readFileSync(join(root, "scripts", "visual-fixture.ts"), "utf8");

test("visual fixture settles stable paid rows in a disposable file database", () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "playlist-headline-visual-"));
  const databasePath = join(tempRoot, "fixture.sqlite");
  const previousWeekNow = process.env.WEEK_NOW;
  const previousMode = process.env.WAFFO_MODE;
  try {
    const first = seedVisualFixture(databasePath);
    const second = seedVisualFixture(databasePath);
    const shape = (rows: typeof first) =>
      rows.map(({ id, track, artist, listenUrl, bidUsd, firstPaidAt, clicks }) => ({
        id,
        track,
        artist,
        listenUrl,
        bidUsd,
        firstPaidAt,
        clicks,
      }));
    assert.deepEqual(shape(first), shape(second));
    assert.equal(first.length, VISUAL_FIXTURE_ROWS.length);
    assert.deepEqual(first.map((row) => row.id), [
      "lst_visual_one",
      "lst_visual_two",
      "lst_visual_three",
      "lst_visual_four",
      "lst_visual_five",
      "lst_visual_six",
    ]);
    assert.deepEqual(first.map((row) => row.clicks), [148, 92, 64, 48, 27, 12]);
    assert.ok(first.every((row) => row.firstPaidAt !== ""));
    assert.equal(process.env.WEEK_NOW, previousWeekNow);
    assert.equal(process.env.WAFFO_MODE, previousMode);
    const store = createStore(databasePath);
    try {
      assert.deepEqual(
        store.listPaidInRollingWeek(new Date(VISUAL_FIXTURE_NOW)).map((row) => row.id),
        first.map((row) => row.id),
      );
    } finally {
      store.close();
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("fixture rows render the ordinary PH09 desk, not the reference surface", () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "playlist-headline-render-"));
  const databasePath = join(tempRoot, "fixture.sqlite");
  try {
    const rows = seedVisualFixture(databasePath);
    const ranked = rankListings(rows);
    const props = {
      weekId: VISUAL_FIXTURE_WEEK,
      nextResetAt: "2026-08-31T00:00:00.000Z",
      listings: ranked,
    };
    const firstHtml = renderToStaticMarkup(createElement(Board, props));
    const secondHtml = renderToStaticMarkup(createElement(Board, props));
    assert.equal(firstHtml, secondHtml);
    assert.equal((firstHtml.match(/class="studio-deck occupied-deck"/g) ?? []).length, 1);
    assert.equal((firstHtml.match(/class="card later-card"/g) ?? []).length, 5);
    assert.equal((firstHtml.match(/data-first-click="hear"/g) ?? []).length, 1);
    assert.match(firstHtml, /PH <span>09<\/span> · Playlist Headline/);
    assert.match(firstHtml, /Midnight Frequency/);
    assert.match(firstHtml, /Signal Studio/);
    assert.match(firstHtml, /\$17,000/);
    assert.match(firstHtml, /148 clicks/);
    assert.match(firstHtml, /data-real-playback="embed"/);
    assert.match(firstHtml, /data-slot="category-rail"/);
    assert.match(firstHtml, /Ambient \/ Field/);
    assert.doesNotMatch(firstHtml, /outbid-reference-root|DTC Picks Daily|picks\.daily|see\.io|tutti\.so|joni\.ai/i);
    assert.doesNotMatch(firstHtml, /unpaid|stream count|monthly listeners|<audio|waveform/i);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("presentation and fixture boundaries are deterministic and never seed during render", () => {
  assert.doesNotMatch(pageSource, /OutbidReferenceFixturePage|renderBoardPage|OUTBID_REFERENCE_FIXTURE_ROWS/);
  assert.doesNotMatch(viewModelSource, /FIXTURE_PRESENTATIONS|Date\.now|Math\.random|fetch\(|createStore|listPaid/);
  assert.match(fixtureSource, /export function seedVisualFixture/);
  assert.match(fixtureSource, /process\.env\.WEEK_NOW = VISUAL_FIXTURE_NOW/);
  assert.match(fixtureSource, /store\.reset\(\)/);
  assert.doesNotMatch(fixtureSource, /src\/app\/page|renderToStaticMarkup|Date\.now|Math\.random/);
});
