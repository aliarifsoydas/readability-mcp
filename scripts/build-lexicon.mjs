/**
 * Generates src/grammar/tr-lexicon.generated.ts from a local TDK dictionary.
 *
 *   npm run build:lexicon -- /path/to/v12.gts.sqlite3.db
 *
 * The database itself is never copied into the repository — only the set of
 * single-word headwords, which is what the orthography rules need to decide
 * whether a stem is a real word.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const db = process.argv[2];
if (!db) {
  console.error("Kullanım: npm run build:lexicon -- /yol/v12.gts.sqlite3.db");
  process.exit(1);
}

const sql = "select distinct lower(madde_duz) from madde where madde_duz not like '% %' and madde_duz <> ''";
const rows = execFileSync("sqlite3", ["-noheader", db, sql], { maxBuffer: 1 << 28 })
  .toString()
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean)
  .sort();

const out = `/**
 * Turkish lemma set, generated from a local copy of the TDK Güncel Türkçe
 * Sözlük by \`npm run build:lexicon\`. Do not edit by hand.
 *
 * ${rows.length} entries.
 */
export const TR_LEXICON: ReadonlySet<string> = new Set<string>(${JSON.stringify(rows)});
`;
writeFileSync("src/grammar/tr-lexicon.generated.ts", out);
console.log(`src/grammar/tr-lexicon.generated.ts yazıldı — ${rows.length} madde`);
