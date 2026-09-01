import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = process.cwd();
const layoutSource = readFileSync(join(root, "src", "app", "layout.tsx"), "utf8");
const cssSource = readFileSync(join(root, "src", "app", "board.css"), "utf8");
const publicPageSources = [
  "src/app/page.tsx",
  "src/app/about/page.tsx",
  "src/app/rules/page.tsx",
  "src/app/return/page.tsx",
  "src/app/checkout/complete/page.tsx",
].map((file) => readFileSync(join(root, file), "utf8"));

test("maker footer exposes one exact visible contact line", () => {
  assert.equal((layoutSource.match(/data-maker-contact=""/g) ?? []).length, 1);
  assert.equal((layoutSource.match(/mailto:tangpingqingwa@gmail\.com/g) ?? []).length, 1);
  assert.match(
    layoutSource,
    /<footer className="maker-footer" data-maker-contact="">\s*<p>Built by <a href="mailto:tangpingqingwa@gmail\.com">tangpingqingwa@gmail\.com<\/a><\/p>/,
  );
});

test("maker footer is shared by the root layout, without page-level duplicates", () => {
  const childrenIndex = layoutSource.indexOf("{children}");
  const footerIndex = layoutSource.indexOf("data-maker-contact=\"\"");
  assert.ok(childrenIndex >= 0 && childrenIndex < footerIndex);
  for (const pageSource of publicPageSources) {
    assert.doesNotMatch(pageSource, /data-maker-contact|maker-footer/);
  }
});

test("maker footer keeps station credit styling usable at narrow widths", () => {
  assert.match(cssSource, /\.maker-footer\s*\{/);
  assert.match(cssSource, /\.maker-footer a:hover\s*\{/);
  assert.match(cssSource, /\.maker-footer a:focus-visible\s*\{/);
  assert.match(cssSource, /border-top:\s*1px dashed var\(--line-strong\)/);
  assert.match(cssSource, /font:\s*11px\/1\.45 var\(--mono\)/);
  assert.match(cssSource, /overflow-wrap:\s*anywhere/);
  assert.match(cssSource, /@media \(max-width: 640px\)[\s\S]*?\.maker-footer\s*\{/);
});
