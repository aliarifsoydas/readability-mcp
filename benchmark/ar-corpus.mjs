/**
 * Validates the Arabic scorer against BAREC, the Balanced Arabic Readability
 * Evaluation Corpus (Elmadani et al., ACL Findings 2025): 69k sentences hand
 * annotated on a 19-level scale from kindergarten to postgraduate.
 *
 * The target is a document's MEAN sentence level, i.e. its average difficulty,
 * which is what every readability formula in this project measures. BAREC's own
 * document label is the level of its single hardest sentence — a different
 * question that no surface average can answer. Both numbers are reported.
 *
 * The corpus is CC-BY-SA-4.0 and fetched on demand into benchmark/corpus-ar/
 * (gitignored) rather than committed.
 *
 * Usage: npm run benchmark:ar
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { scoreText, detectLanguage } from "../.test-build/scorers/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, "corpus-ar");
const BASE = "https://huggingface.co/datasets/CAMeL-Lab/BAREC-Shared-Task-2025-sent/resolve/main";
const MIN_RHO = 0.65;

function ensure(file) {
  const path = join(DIR, file);
  if (existsSync(path)) return path;
  mkdirSync(DIR, { recursive: true });
  console.log(`Downloading ${file} from BAREC ...`);
  execFileSync("curl", ["-sL", "--max-time", "300", "-o", path, `${BASE}/${file}`], { stdio: "inherit" });
  return path;
}

/** Minimal RFC4180 reader — the corpus quotes sentences containing commas. */
function parseCsv(text) {
  const rows = [];
  let field = "", row = [], quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function spearman(xs, ys) {
  const rank = (v) => {
    const order = v.map((_, i) => i).sort((a, b) => v[a] - v[b]);
    const r = new Array(v.length);
    let i = 0;
    while (i < order.length) {
      let j = i;
      while (j + 1 < order.length && v[order[j + 1]] === v[order[i]]) j++;
      const shared = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) r[order[k]] = shared;
      i = j + 1;
    }
    return r;
  };
  const rx = rank(xs), ry = rank(ys);
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const mx = mean(rx), my = mean(ry);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (rx[i] - mx) * (ry[i] - my);
    dx += (rx[i] - mx) ** 2;
    dy += (ry[i] - my) ** 2;
  }
  return num / Math.sqrt(dx * dy);
}

let path;
try {
  path = ensure(process.argv[2] === "--train" ? "train.csv" : "dev.csv");
} catch (err) {
  console.error(`Could not fetch the corpus: ${err instanceof Error ? err.message : err}`);
  process.exit(2);
}

const raw = parseCsv(readFileSync(path, "utf8"));
const header = raw[0].map((h) => h.replace(/^﻿/, ""));
const rows = raw.slice(1).filter((r) => r.length === header.length)
  .map((r) => Object.fromEntries(r.map((v, i) => [header[i], v])));

const docs = new Map();
for (const r of rows) {
  if (!docs.has(r.Document)) docs.set(r.Document, []);
  docs.get(r.Document).push(r);
}

const items = [];
for (const [, sents] of docs) {
  if (sents.length < 12) continue;
  const levels = sents.map((s) => Number(s.Readability_Level_19));
  items.push({
    // Newline separated: BAREC rows are one sentence each and many carry no
    // terminal punctuation, so a space join would erase every boundary.
    text: sents.map((s) => s.Sentence).join("\n"),
    mean: levels.reduce((a, b) => a + b, 0) / levels.length,
    max: Math.max(...levels),
  });
}

const failures = [];
const scored = items.map((it) => scoreText(it.text, "ar"));
const detected = items.filter((it) => detectLanguage(it.text) === "ar").length;
console.log(`\n${items.length} documents, ${rows.length} annotated sentences`);
console.log(`detected as Arabic by script: ${detected}/${items.length}`);
if (detected !== items.length) failures.push(`${items.length - detected} documents were not detected as Arabic`);

console.log("\n=== 1. Correlation with average difficulty (what formulas measure) ===");
const means = items.map((i) => i.mean);
for (const key of ["awl_asl_index", "arabic_ari"]) {
  const rho = spearman(means, scored.map((s) => s.metrics[key]));
  const ok = rho >= MIN_RHO;
  if (!ok) failures.push(`${key}: rho ${rho.toFixed(3)} below ${MIN_RHO}`);
  console.log(`${ok ? "ok " : "FAIL"} ${key.padEnd(16)} rho = ${rho.toFixed(3)}`);
}
const rhoOverall = spearman(means, scored.map((s) => s.overall_100));
const overallOk = rhoOverall <= -MIN_RHO;
if (!overallOk) failures.push(`overall_100: rho ${rhoOverall.toFixed(3)} weaker than ${-MIN_RHO}`);
console.log(`${overallOk ? "ok " : "FAIL"} ${"overall_100".padEnd(16)} rho = ${rhoOverall.toFixed(3)}  (negative is correct: higher level = lower score)`);

console.log("\n=== 2. Correlation with BAREC's own document label (hardest sentence) ===");
console.log("(reported, not asserted — a surface average cannot predict a maximum)");
console.log(`    overall_100 vs max-of-sentences   rho = ${spearman(items.map((i) => i.max), scored.map((s) => s.overall_100)).toFixed(3)}`);

console.log("\n=== 3. Level band placement (target: 75 at level 6, -5 per level) ===");
const bands = new Map();
items.forEach((it, i) => {
  const lv = Math.round(it.mean);
  if (!bands.has(lv)) bands.set(lv, []);
  bands.get(lv).push(scored[i].overall_100);
});
for (const lv of [...bands.keys()].sort((a, b) => a - b)) {
  const v = bands.get(lv);
  if (v.length < 5) continue;
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const target = 105 - 5 * lv;
  const off = Math.abs(mean - target);
  const ok = off <= 12;
  if (!ok) failures.push(`level ${lv}: mean ${mean.toFixed(1)} vs target ${target}`);
  console.log(`${ok ? "ok " : "FAIL"} level ${String(lv).padStart(2)}  n=${String(v.length).padStart(4)}  mean ${mean.toFixed(1).padStart(5)}  (target ${target}, off ${off.toFixed(1)})`);
}

console.log("\n=== 4. Mean raw values per level (input for re-fitting normalize.ts) ===");
console.log("level     n      ASL     AWL   awl_asl_index   arabic_ari");
for (const lv of [...bands.keys()].sort((a, b) => a - b)) {
  const idx = items.map((it, i) => [it, scored[i]]).filter(([it]) => Math.round(it.mean) === lv);
  if (idx.length < 5) continue;
  const avg = (f) => idx.reduce((s, [, sc]) => s + f(sc), 0) / idx.length;
  console.log(
    `  ${String(lv).padStart(3)} ${String(idx.length).padStart(5)}  ${avg((s) => s.stats.avg_sentence_length).toFixed(2).padStart(7)} ` +
    `${avg((s) => s.stats.avg_word_length).toFixed(2).padStart(7)} ${avg((s) => s.metrics.awl_asl_index).toFixed(3).padStart(13)} ` +
    `${avg((s) => s.metrics.arabic_ari).toFixed(2).padStart(12)}`);
}

if (failures.length) {
  console.error(`\n${failures.length} benchmark failure(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("\nAll Arabic benchmark checks passed.");
