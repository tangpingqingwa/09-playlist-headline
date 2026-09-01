import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const pageSource = readFileSync(join(root, "src", "app", "page.tsx"), "utf8");
const fixtureSource = readFileSync(join(root, "scripts", "visual-fixture.ts"), "utf8");
const referencePageSource = readFileSync(join(root, "src", "app", "outbid-reference-page.tsx"), "utf8");

test("the production page always uses the ordinary Playlist renderer", () => {
  assert.match(pageSource, /rankListings\(getBoardListings\(now\)\)/);
  assert.match(pageSource, /<Board/);
  assert.doesNotMatch(pageSource, /OutbidReferenceFixturePage|renderBoardPage|OUTBID_REFERENCE_FIXTURE_ROWS/);
  assert.doesNotMatch(pageSource, /outbid-reference-root|dangerouslySetInnerHTML/);
});

test("reference renderer is unreachable residue, while the disposable fixture stays explicit", () => {
  assert.match(referencePageSource, /outbid-reference-root/);
  assert.match(referencePageSource, /adaptReferenceDocument/);
  assert.match(fixtureSource, /export function seedVisualFixture/);
  assert.match(fixtureSource, /disposable file-backed DATABASE_PATH/);
  assert.doesNotMatch(fixtureSource, /src\/app\/page|renderToStaticMarkup|Date\.now|Math\.random/);
});
