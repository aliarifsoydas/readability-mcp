/**
 * Validates the Latin-script languages against paired encyclopedia articles:
 * the same topic written for children and written for adults.
 *
 *   en  Simple English Wikipedia  vs  English Wikipedia
 *   es  Vikidia (es)              vs  Spanish Wikipedia
 *   fr  Vikidia (fr)              vs  French Wikipedia
 *   it  Vikidia (it)              vs  Italian Wikipedia
 *   de  Klexikon                  vs  German Wikipedia
 *
 * Pairing on topic is what makes this usable as ground truth: both halves cover
 * the same subject, so anything the scorer sees is a difference in how it is
 * written rather than what it is about. The test is ordinal — the children's
 * version must score easier — which needs no calibrated scale to be meaningful.
 *
 * Topics are resolved from a fixed English list through Wikipedia's langlinks,
 * so the corpus is the same on every run. Articles are cached in
 * benchmark/corpus-paired/ (gitignored).
 *
 * Usage: npm run benchmark:paired
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { scoreText } from "../.test-build/scorers/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE = join(HERE, "corpus-paired");
const UA = "readability-mcp-benchmark/1.0 (https://github.com/aliarifsoydas/readability-mcp)";

/**
 * A fixed list of everyday subjects a children's encyclopedia is likely to
 * cover. Each is resolved into the target language through Wikipedia's own
 * langlinks, so both halves of a pair are the same subject and the corpus is
 * identical on every run. Topic is therefore held constant and the only thing
 * left for the scorer to see is how the text is written.
 */
const TOPICS = [
  "Cat", "Dog", "Horse", "Elephant", "Lion", "Whale", "Shark", "Bee", "Butterfly", "Tree",
  "Sun", "Moon", "Earth", "Water", "Fire", "Volcano", "Rain", "Snow", "Desert", "Ocean",
  "Mountain", "River", "Forest", "Salt", "Gold", "Iron", "Milk", "Bread", "Sugar", "Coffee",
  "Football", "Music", "Painting", "Book", "School", "Bicycle", "Train", "Airplane", "Bridge", "Castle",
  "Egypt", "France", "Japan", "Brazil", "India", "Rome", "Paris", "Democracy", "Money", "War",
  "Electricity", "Magnet", "Gravity", "Light", "Sound", "Heart", "Brain", "Blood", "Bone", "Virus",
];

const SOURCES = {
  en: { simple: "https://simple.wikipedia.org/w/api.php", standard: "https://en.wikipedia.org/w/api.php" },
  es: { simple: "https://es.vikidia.org/w/api.php", standard: "https://es.wikipedia.org/w/api.php" },
  fr: { simple: "https://fr.vikidia.org/w/api.php", standard: "https://fr.wikipedia.org/w/api.php" },
  it: { simple: "https://it.vikidia.org/w/api.php", standard: "https://it.wikipedia.org/w/api.php" },
  de: { simple: "https://klexikon.zum.de/api.php", standard: "https://de.wikipedia.org/w/api.php" },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Wikipedia rate-limits briskly, so back off and retry rather than give up. */
async function api(endpoint, params, attempt = 0) {
  const url = `${endpoint}?${new URLSearchParams({ format: "json", ...params })}`;
  try {
    const res = await fetch(url, { headers: { "user-agent": UA } });
    if (res.status === 429 || res.status >= 500) throw new Error(`${res.status}`);
    if (!res.ok) throw new Error(`${res.status} ${endpoint}`);
    await sleep(600);
    return res.json();
  } catch (err) {
    if (attempt >= 3) throw err;
    await sleep(4000 * (attempt + 1));
    return api(endpoint, params, attempt + 1);
  }
}

/**
 * One title per request. MediaWiki only honours `exlimit` above 1 when the
 * request is restricted to lead sections, and we need whole articles.
 */
async function extracts(endpoint, titles) {
  // Klexikon runs a plain MediaWiki without the TextExtracts extension, so its
  // articles have to come back as parsed HTML and be stripped here.
  const viaParse = endpoint.includes("klexikon");
  const out = {};
  for (const title of titles) {
    try {
      if (viaParse) {
        const data = await api(endpoint, { action: "parse", page: title, prop: "text", redirects: "1" });
        const html = data.parse?.text?.["*"];
        if (html) {
          const text = html
            .replace(/<(script|style|table)[\s\S]*?<\/\1>/g, " ")
            .replace(/<\/p>/g, "\n\n")
            .replace(/<[^>]+>/g, " ")
            .replace(/&#\d+;|&[a-z]+;/g, " ")
            .replace(/[ \t]+/g, " ")
            .trim();
          if (text) out[title] = text;
        }
      } else {
        const data = await api(endpoint, {
          action: "query", prop: "extracts", explaintext: "1", redirects: "1", titles: title,
        });
        for (const page of Object.values(data.query?.pages ?? {})) {
          if (page.extract) out[title] = page.extract;
        }
      }
    } catch {
      // A missing article is an ordinary outcome; the pair is simply dropped.
    }
  }
  return out;
}

/** English title -> title in the target language, via Wikipedia's own langlinks. */
async function localize(lang, titles) {
  if (lang === "en") return Object.fromEntries(titles.map((t) => [t, t]));
  const out = {};
  for (let i = 0; i < titles.length; i += 20) {
    const batch = titles.slice(i, i + 20);
    const data = await api(SOURCES.en.standard, {
      action: "query", prop: "langlinks", lllang: lang, lllimit: "500",
      redirects: "1", titles: batch.join("|"),
    });
    const norm = {};
    for (const n of data.query?.normalized ?? []) norm[n.to] = n.from;
    for (const page of Object.values(data.query?.pages ?? {})) {
      const link = page.langlinks?.[0]?.["*"];
      if (link) out[norm[page.title] ?? page.title] = link;
    }
  }
  return out;
}

/**
 * Children's encyclopedias do not always title an article the way Wikipedia
 * does — Klexikon files the cat under "Katzen" where Wikipedia says
 * "Hauskatze" — so fall back to the wiki's own search when the exact title is
 * missing, and accept the top hit.
 */
async function resolveOnSimple(endpoint, title) {
  try {
    const data = await api(endpoint, {
      action: "query", list: "search", srsearch: title, srlimit: "1", srnamespace: "0",
    });
    return data.query?.search?.[0]?.title;
  } catch {
    return undefined;
  }
}

function clean(text, maxChars = 9000) {
  return text
    .split("\n")
    .filter((l) => l.trim() && !/^=+.*=+$/.test(l.trim()))
    .join("\n\n")
    .slice(0, maxChars);
}

async function buildPairs(lang) {
  const file = join(CACHE, `${lang}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  mkdirSync(CACHE, { recursive: true });
  console.log(`  fetching ${lang} ...`);
  const localized = await localize(lang, TOPICS);
  const entries = Object.entries(localized);

  const standard = await extracts(SOURCES[lang].standard, entries.map(([, t]) => t));
  const simple = await extracts(SOURCES[lang].simple, entries.map(([, t]) => t));
  for (const [, title] of entries) {
    if (simple[title] || !standard[title]) continue;
    const alt = await resolveOnSimple(SOURCES[lang].simple, title);
    if (!alt) continue;
    const found = await extracts(SOURCES[lang].simple, [alt]);
    if (found[alt]) simple[title] = found[alt];
  }

  const pairs = [];
  for (const [topic, title] of entries) {
    const s = simple[title], c = standard[title];
    if (!s || !c) continue;
    const sc = clean(s), cc = clean(c);
    if (sc.split(/\s+/).length < 90 || cc.split(/\s+/).length < 90) continue;
    pairs.push({ topic, title, simple: sc, standard: cc });
  }
  writeFileSync(file, JSON.stringify(pairs));
  return pairs;
}

const only = process.argv[2];
const langs = only ? [only] : Object.keys(SOURCES);
const failures = [];

console.log("Paired encyclopedia benchmark — children's version must score easier\n");
for (const lang of langs) {
  let pairs;
  try {
    pairs = await buildPairs(lang);
  } catch (err) {
    console.error(`${lang}: could not build corpus — ${err instanceof Error ? err.message : err}`);
    process.exit(2);
  }
  if (pairs.length < 10) {
    console.log(`${lang}: only ${pairs.length} usable pairs, skipping`);
    continue;
  }
  let correct = 0;
  let sumSimple = 0, sumStandard = 0;
  const wrong = [];
  for (const p of pairs) {
    const s = scoreText(p.simple, lang);
    const c = scoreText(p.standard, lang);
    sumSimple += s.overall_100;
    sumStandard += c.overall_100;
    if (s.overall_100 > c.overall_100) correct++;
    else wrong.push(`${p.topic} (${s.overall_100.toFixed(1)} vs ${c.overall_100.toFixed(1)})`);
  }
  const acc = correct / pairs.length;
  const meanS = sumSimple / pairs.length, meanC = sumStandard / pairs.length;
  const ok = acc >= 0.8;
  if (!ok) failures.push(`${lang}: ordered ${(acc * 100).toFixed(0)}% of pairs correctly`);
  console.log(
    `${ok ? "ok  " : "FAIL"} ${lang}  ${pairs.length} pairs  ` +
    `ordered correctly ${correct}/${pairs.length} (${(acc * 100).toFixed(0)}%)  ` +
    `mean simple ${meanS.toFixed(1)} vs standard ${meanC.toFixed(1)}  gap ${(meanS - meanC).toFixed(1)}`,
  );
  if (wrong.length) console.log(`       misordered: ${wrong.slice(0, 5).join(", ")}${wrong.length > 5 ? ` (+${wrong.length - 5})` : ""}`);
}

if (failures.length) {
  console.error(`\n${failures.length} failure(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("\nAll paired checks passed.");
