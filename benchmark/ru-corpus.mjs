/**
 * Validates the Russian scorer against the Russian Readability Corpus (RRC):
 * two sets of Social Studies textbooks for grades 5-11, published alongside
 * Ivanov, Solnyshkina & Solovyev, "Efficiency of Text Readability Features in
 * Russian Academic Texts" (Dialogue 2018).
 *
 * Two independent checks:
 *   1. Tokenizer — our ASL/ASW must reproduce the paper's Table 1.
 *   2. Ranking   — scores must fall as the grade level rises.
 *
 * The corpus is textbook material, so it is downloaded on demand into
 * benchmark/corpus/ (gitignored) rather than committed.
 *
 * Usage: npm run benchmark
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { scoreText } from "../.test-build/scorers/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS_DIR = join(HERE, "corpus");
const CORPUS_URL = "https://kpfu.ru/portal/docs/F1554781210/shuffled.zip";

/** Table 1 of the paper: [grade, ASL, ASW] keyed by corpus file. */
const REFERENCE = {
  "nik/year_nik_05.txt": [5, 11.49, 2.35],
  "bog/year_bog_06.txt": [6, 12.94, 2.56],
  "nik/year_nik_06.txt": [6, 13.76, 2.71],
  "bog/year_bog_07.txt": [7, 13.81, 2.84],
  "nik/year_nik_07.txt": [7, 13.69, 2.7],
  "bog/year_bog_08.txt": [8, 15.65, 2.96],
  "nik/year_nik_08.txt": [8, 13.86, 2.88],
  "bog/year_bog_09.txt": [9, 16.37, 3.04],
  "nik/year_nik_09.txt": [9, 15.55, 3.0],
  "bog/year_bog_10.txt": [10, 16.83, 3.07],
  "nik/year_nik_10.txt": [10, 15.88, 3.12],
  "bog/year_bog_10p.txt": [10, 16.91, 3.05],
  "nik/year_nik_11.txt": [11, 17.12, 3.11],
  "bog/year_bog_11p.txt": [11, 16.79, 3.19],
};

/**
 * The paper counts punctuation as tokens and we count words, so its ASL runs
 * about one token per sentence higher and its ASW a few percent higher. Absolute
 * agreement is therefore the wrong test: what must hold is that our measurements
 * track the paper's across the corpus (correlation) and that the gap stays a
 * stable offset rather than drifting per text (bounded spread).
 */
const MIN_TOKENIZER_R = 0.95;
/** Their ASL minus ours, in tokens per sentence — one punctuation mark, give or take. */
const ASL_OFFSET_RANGE = [0.5, 2.0];
/** Ours over theirs, per word. */
const ASW_RATIO_RANGE = [0.9, 1.0];
const MIN_ABS_RHO = 0.85;

function ensureCorpus() {
  if (existsSync(CORPUS_DIR) && readdirSync(CORPUS_DIR).length > 0) return true;
  mkdirSync(CORPUS_DIR, { recursive: true });
  const zip = join(CORPUS_DIR, "rrc.zip");
  try {
    console.log(`Downloading the corpus from ${CORPUS_URL} ...`);
    execFileSync("curl", ["-sL", "--max-time", "180", "-o", zip, CORPUS_URL], { stdio: "inherit" });
    execFileSync("unzip", ["-o", "-q", zip, "-d", CORPUS_DIR], { stdio: "inherit" });
    return true;
  } catch (err) {
    console.error(`\nCould not fetch the corpus: ${err instanceof Error ? err.message : err}`);
    return false;
  }
}

/** Spearman rank correlation, averaging ranks over ties. */
function spearman(xs, ys) {
  const rank = (values) => {
    const order = values.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
    const ranks = new Array(values.length);
    let i = 0;
    while (i < order.length) {
      let j = i;
      while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
      const shared = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) ranks[order[k][1]] = shared;
      i = j + 1;
    }
    return ranks;
  };
  const rx = rank(xs);
  const ry = rank(ys);
  const n = xs.length;
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const mx = mean(rx);
  const my = mean(ry);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (rx[i] - mx) * (ry[i] - my);
    dx += (rx[i] - mx) ** 2;
    dy += (ry[i] - my) ** 2;
  }
  return num / Math.sqrt(dx * dy);
}

if (!ensureCorpus()) {
  console.error("Benchmark skipped — the corpus could not be downloaded.");
  process.exit(2);
}

const rows = [];
for (const [file, [grade, refAsl, refAsw]] of Object.entries(REFERENCE)) {
  const path = join(CORPUS_DIR, file);
  if (!existsSync(path)) {
    console.error(`Missing corpus file: ${file}`);
    process.exit(2);
  }
  const text = readFileSync(path, "utf8");
  const r = scoreText(text, "ru");
  rows.push({
    file,
    grade,
    refAsl,
    refAsw,
    asl: r.stats.avg_sentence_length,
    asw: r.stats.avg_syllables_per_word,
    x4: r.stats.long_word_percentage,
    detected: r.language,
    overall: r.overall_100,
    raw: r.metrics,
    metrics: r.metrics_100,
  });
}

function pearson(xs, ys) {
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  return num / Math.sqrt(dx * dy);
}

console.log("\n=== 1. Tokenizer vs the paper's Table 1 ===");
console.log("file                     grade   ASL(ours/paper)      ASW(ours/paper)");
const failures = [];
for (const row of rows) {
  console.log(
    `    ${row.file.padEnd(22)} ${String(row.grade).padStart(2)}   ` +
      `${row.asl.toFixed(2)} / ${row.refAsl.toFixed(2)} (${(((row.asl - row.refAsl) / row.refAsl) * 100).toFixed(1)}%)   ` +
      `${row.asw.toFixed(2)} / ${row.refAsw.toFixed(2)} (${(((row.asw - row.refAsw) / row.refAsw) * 100).toFixed(1)}%)`,
  );
  if (row.detected !== "ru") failures.push(`${row.file}: detected as ${row.detected}`);
}

// ASL differs by a whole punctuation token per sentence, so compare it as an
// absolute offset; ASW is a per-word quantity, so compare it as a ratio.
const aslR = pearson(rows.map((r) => r.asl), rows.map((r) => r.refAsl));
const aslOffsets = rows.map((r) => r.refAsl - r.asl);
const aslOk =
  aslR >= MIN_TOKENIZER_R &&
  Math.min(...aslOffsets) >= ASL_OFFSET_RANGE[0] &&
  Math.max(...aslOffsets) <= ASL_OFFSET_RANGE[1];
if (!aslOk) failures.push(`ASL: r=${aslR.toFixed(3)}, offsets ${Math.min(...aslOffsets).toFixed(2)}..${Math.max(...aslOffsets).toFixed(2)} tokens/sentence`);
console.log(
  `${aslOk ? "ok " : "FAIL"} ASL: r = ${aslR.toFixed(3)}, ` +
    `paper - ours = ${Math.min(...aslOffsets).toFixed(2)}..${Math.max(...aslOffsets).toFixed(2)} tokens/sentence`,
);

const aswR = pearson(rows.map((r) => r.asw), rows.map((r) => r.refAsw));
const aswRatios = rows.map((r) => r.asw / r.refAsw);
const aswOk =
  aswR >= MIN_TOKENIZER_R &&
  Math.min(...aswRatios) >= ASW_RATIO_RANGE[0] &&
  Math.max(...aswRatios) <= ASW_RATIO_RANGE[1];
if (!aswOk) failures.push(`ASW: r=${aswR.toFixed(3)}, ratios ${Math.min(...aswRatios).toFixed(3)}..${Math.max(...aswRatios).toFixed(3)}`);
console.log(
  `${aswOk ? "ok " : "FAIL"} ASW: r = ${aswR.toFixed(3)}, ` +
    `ours / paper = ${Math.min(...aswRatios).toFixed(3)}..${Math.max(...aswRatios).toFixed(3)}`,
);

console.log("\n=== 2. Score vs grade level ===");
console.log("file                     grade  oborneva  matskovskiy  tuldava  overall");
for (const row of rows.slice().sort((a, b) => a.grade - b.grade || a.file.localeCompare(b.file))) {
  console.log(
    `    ${row.file.padEnd(22)} ${String(row.grade).padStart(2)}   ` +
      `${row.metrics.oborneva.toFixed(1).padStart(7)}  ${row.metrics.matskovskiy.toFixed(1).padStart(10)}  ` +
      `${row.metrics.tuldava.toFixed(1).padStart(7)}  ${row.overall.toFixed(1).padStart(6)}`,
  );
}

const grades = rows.map((r) => r.grade);
console.log("\n=== 3. Spearman rank correlation with grade level ===");
console.log("(negative is correct: a higher grade must score lower)");
for (const key of ["oborneva", "matskovskiy", "tuldava"]) {
  const rho = spearman(grades, rows.map((r) => r.metrics[key]));
  const ok = rho <= -MIN_ABS_RHO;
  if (!ok) failures.push(`${key}: rho ${rho.toFixed(3)} weaker than ${-MIN_ABS_RHO}`);
  console.log(`${ok ? "ok " : "FAIL"} ${key.padEnd(12)} rho = ${rho.toFixed(3)}`);
}
const rhoOverall = spearman(grades, rows.map((r) => r.overall));
const overallOk = rhoOverall <= -MIN_ABS_RHO;
if (!overallOk) failures.push(`overall: rho ${rhoOverall.toFixed(3)} weaker than ${-MIN_ABS_RHO}`);
console.log(`${overallOk ? "ok " : "FAIL"} ${"overall".padEnd(12)} rho = ${rhoOverall.toFixed(3)}`);

console.log("\n=== 4. Grade-band placement ===");
// The normalization is anchored so that grade 5 lands near 90 and grade 11 near 30.
const byGrade = new Map();
for (const row of rows) {
  if (!byGrade.has(row.grade)) byGrade.set(row.grade, []);
  byGrade.get(row.grade).push(row.overall);
}
const EXPECTED = { 5: 90, 6: 80, 7: 70, 8: 60, 9: 50, 10: 40, 11: 30 };
for (const [grade, expected] of Object.entries(EXPECTED)) {
  const values = byGrade.get(Number(grade)) ?? [];
  if (values.length === 0) continue;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const off = Math.abs(mean - expected);
  const ok = off <= 15;
  if (!ok) failures.push(`grade ${grade}: mean ${mean.toFixed(1)} vs expected ${expected}`);
  console.log(`${ok ? "ok " : "FAIL"} grade ${grade}: mean ${mean.toFixed(1)} (expected ~${expected}, off by ${off.toFixed(1)})`);
}

console.log("\n=== 5. Mean raw values per grade (input for re-fitting the curves in normalize.ts) ===");
console.log("grade   n     ASL    ASW     x4   oborneva  matskovskiy  tuldava");
const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length;
for (const grade of [...new Set(rows.map((r) => r.grade))].sort((a, b) => a - b)) {
  const g = rows.filter((r) => r.grade === grade);
  console.log(
    `  ${String(grade).padStart(2)}  ${String(g.length).padStart(2)}  ` +
      `${avg(g.map((r) => r.asl)).toFixed(2).padStart(6)} ${avg(g.map((r) => r.asw)).toFixed(2).padStart(6)} ` +
      `${avg(g.map((r) => r.x4)).toFixed(1).padStart(6)} ` +
      `${avg(g.map((r) => r.raw.oborneva)).toFixed(2).padStart(9)} ` +
      `${avg(g.map((r) => r.raw.matskovskiy)).toFixed(2).padStart(12)} ` +
      `${avg(g.map((r) => r.raw.tuldava)).toFixed(3).padStart(8)}`,
  );
}

if (failures.length > 0) {
  console.error(`\n${failures.length} benchmark failure(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("\nAll benchmark checks passed.");
