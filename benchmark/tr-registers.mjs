/**
 * Turkish has no freely available graded corpus and no children's encyclopedia,
 * so it gets the weakest of the three validations here: a two-class separation
 * between registers that are unambiguously far apart — folk tales and fables
 * against statutes — both from Turkish Wikisource.
 *
 * Read the result for what it is. Unlike the paired benchmark this does not hold
 * topic constant, and the gap between a fairy tale and a legal code is wide
 * enough that any scorer which is not actively broken will separate them. It can
 * catch a dead formula; it cannot certify calibration. The Wikipedia lead/body
 * proxy was tried first and rejected: on English, where the paired benchmark
 * scores 100%, that proxy scored 39%, so its premise was wrong rather than the
 * scorer.
 *
 * Usage: npm run benchmark:tr
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { scoreText } from "../.test-build/scorers/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE = join(HERE, "corpus-tr");
const API = "https://tr.wikisource.org/w/api.php";
const UA = "readability-mcp-benchmark/1.0 (https://github.com/aliarifsoydas/readability-mcp)";

const CLASSES = {
  easy: ["Kategori:Nasreddin Hoca fıkraları", "Kategori:Türk halk edebiyatında masallar", "Kategori:Hikâyeler"],
  hard: ["Kategori:Kanunlar", "Kategori:Yönetmelikler", "Kategori:Tüzükler"],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(params, attempt = 0) {
  const url = `${API}?${new URLSearchParams({ format: "json", ...params })}`;
  try {
    const res = await fetch(url, { headers: { "user-agent": UA } });
    if (res.status === 429 || res.status >= 500) throw new Error(String(res.status));
    if (!res.ok) throw new Error(String(res.status));
    await sleep(500);
    return res.json();
  } catch (err) {
    if (attempt >= 3) throw err;
    await sleep(3000 * (attempt + 1));
    return api(params, attempt + 1);
  }
}

async function members(category) {
  const data = await api({ action: "query", list: "categorymembers", cmtitle: category, cmlimit: "60", cmnamespace: "0" });
  return (data.query?.categorymembers ?? []).map((m) => m.title);
}

async function text(title) {
  const data = await api({ action: "query", prop: "extracts", explaintext: "1", redirects: "1", titles: title });
  const page = Object.values(data.query?.pages ?? {})[0];
  return page?.extract
    ?.split("\n")
    .filter((l) => l.trim() && !/^=+.*=+$/.test(l.trim()))
    .join("\n\n")
    .slice(0, 9000);
}

async function build() {
  const file = join(CACHE, "tr.json");
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  mkdirSync(CACHE, { recursive: true });
  const out = { easy: [], hard: [] };
  for (const [cls, cats] of Object.entries(CLASSES)) {
    console.log(`  fetching ${cls} ...`);
    for (const cat of cats) {
      let titles = [];
      try {
        titles = await members(cat);
      } catch {
        continue;
      }
      for (const t of titles.slice(0, 30)) {
        if (out[cls].length >= 30) break;
        try {
          const body = await text(t);
          if (body && body.split(/\s+/).length >= 80) out[cls].push({ title: t, text: body });
        } catch {
          // skip
        }
      }
    }
  }
  writeFileSync(file, JSON.stringify(out));
  return out;
}

const corpus = await build();
console.log("\nTurkish register separation — tales should score easier than statutes\n");
if (corpus.easy.length < 8 || corpus.hard.length < 8) {
  console.error(`Not enough material: ${corpus.easy.length} tales, ${corpus.hard.length} statutes.`);
  process.exit(2);
}

const score = (items) => items.map((i) => scoreText(i.text, "tr").overall_100);
const easy = score(corpus.easy);
const hard = score(corpus.hard);
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;

// Every tale against every statute: the share of comparisons in the right order
// is the probability the scorer ranks a random pair correctly.
let wins = 0;
for (const e of easy) for (const h of hard) if (e > h) wins++;
const auc = wins / (easy.length * hard.length);

console.log(`  tales    n=${String(easy.length).padStart(2)}  mean ${mean(easy).toFixed(1)}  range ${Math.min(...easy).toFixed(0)}-${Math.max(...easy).toFixed(0)}`);
console.log(`  statutes n=${String(hard.length).padStart(2)}  mean ${mean(hard).toFixed(1)}  range ${Math.min(...hard).toFixed(0)}-${Math.max(...hard).toFixed(0)}`);
console.log(`\n  separation: ${(auc * 100).toFixed(1)}% of tale/statute comparisons ordered correctly`);
console.log(`  gap in means: ${(mean(easy) - mean(hard)).toFixed(1)} points`);

if (auc < 0.9) {
  console.error("\nFAIL: the two registers are not separated.");
  process.exit(1);
}
console.log("\nTurkish separation check passed (coarse — see the note at the top of this file).");
