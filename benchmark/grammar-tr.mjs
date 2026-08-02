/**
 * Measures the false-positive rate of the Turkish orthography rules against the
 * example sentences in the TDK dictionary — text that is correct by definition,
 * so every finding is a false positive.
 *
 *   npm run benchmark:grammar -- /path/to/v12.gts.sqlite3.db
 *
 * The bar is 0.5% per rule. Two rules were dropped for missing it: the question
 * particle (0.66%) and the da/de conjunction (6.43%).
 */
import { execFileSync } from "node:child_process";
import { checkTurkish } from "../.test-build/grammar/tr.js";

const db = process.argv[2];
if (!db) {
  console.error("Kullanım: npm run benchmark:grammar -- /yol/v12.gts.sqlite3.db");
  process.exit(2);
}
if (!checkTurkish("deneme").lexicon_available) {
  console.error("Sözlük üretilmemiş. Önce: npm run build:lexicon -- <db>");
  process.exit(2);
}

const sql = "select replace(replace(ornek, char(13),' '), char(10),' ') from ornek where ornek is not null and length(ornek) > 25";
const sentences = execFileSync("sqlite3", ["-noheader", db, sql], { maxBuffer: 1 << 28 })
  .toString().split("\n").map((s) => s.trim()).filter(Boolean);

const byRule = {};
let flagged = 0;
for (const s of sentences) {
  const f = checkTurkish(s).findings;
  if (!f.length) continue;
  flagged++;
  for (const x of f) byRule[x.rule] = (byRule[x.rule] ?? 0) + 1;
}

const LIMIT = 0.5;
console.log(`\n${sentences.length} tanıklı cümle (tanım gereği doğru Türkçe)\n`);
console.log("kural".padEnd(26) + "bulgu".padStart(8) + "oran".padStart(9) + "   durum");
console.log("-".repeat(56));
const failures = [];
for (const [rule, n] of Object.entries(byRule).sort((a, b) => b[1] - a[1])) {
  const rate = (100 * n) / sentences.length;
  const ok = rate <= LIMIT;
  if (!ok) failures.push(`${rule}: %${rate.toFixed(2)} > %${LIMIT}`);
  console.log(rule.padEnd(26) + String(n).padStart(8) + `%${rate.toFixed(2)}`.padStart(9) + `   ${ok ? "ok" : "FAIL"}`);
}
console.log("-".repeat(56));
console.log(`en az bir bulgu alan cümle: ${flagged} (%${((100 * flagged) / sentences.length).toFixed(2)})`);

if (failures.length) {
  console.error(`\n${failures.length} kural barajı aştı:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("\nTüm kurallar %0.5 barajının altında.");
