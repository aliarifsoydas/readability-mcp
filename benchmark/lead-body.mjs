/**
 * A fallback validation for languages with no children's encyclopedia, which is
 * every language here except en/es/fr/it/de.
 *
 * A Wikipedia lead section is written as an accessible summary and the body
 * that follows is not, so the lead should score easier. Topic is held perfectly
 * constant — it is the same article.
 *
 * The proxy is only worth anything if it agrees with real ground truth, so it
 * runs on the five languages that also have a paired children's corpus. Compare
 * the accuracy here with `npm run benchmark:paired`: where the two agree, the
 * proxy can be trusted for the languages that have nothing else.
 *
 * Usage: npm run benchmark:lead [lang]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { scoreText } from "../.test-build/scorers/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE = join(HERE, "corpus-lead");
const UA = "readability-mcp-benchmark/1.0 (https://github.com/aliarifsoydas/readability-mcp)";

const TOPICS = [
  "Cat", "Dog", "Horse", "Elephant", "Lion", "Whale", "Shark", "Bee", "Tree",
  "Sun", "Moon", "Earth", "Water", "Volcano", "Desert", "Ocean", "Mountain", "River",
  "Salt", "Gold", "Iron", "Milk", "Bread", "Coffee", "Music", "Book", "School",
  "Train", "Airplane", "Bridge", "Egypt", "France", "Japan", "Brazil", "India",
  "Democracy", "Money", "Electricity", "Gravity", "Light", "Heart", "Brain", "Blood", "Virus",
];

const WIKI = {
  en: "https://en.wikipedia.org/w/api.php",
  es: "https://es.wikipedia.org/w/api.php",
  fr: "https://fr.wikipedia.org/w/api.php",
  it: "https://it.wikipedia.org/w/api.php",
  de: "https://de.wikipedia.org/w/api.php",
  tr: "https://tr.wikipedia.org/w/api.php",
  ru: "https://ru.wikipedia.org/w/api.php",
  ar: "https://ar.wikipedia.org/w/api.php",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(endpoint, params, attempt = 0) {
  const url = `${endpoint}?${new URLSearchParams({ format: "json", ...params })}`;
  try {
    const res = await fetch(url, { headers: { "user-agent": UA } });
    if (res.status === 429 || res.status >= 500) throw new Error(`${res.status}`);
    if (!res.ok) throw new Error(`${res.status}`);
    await sleep(600);
    return res.json();
  } catch (err) {
    if (attempt >= 3) throw err;
    await sleep(4000 * (attempt + 1));
    return api(endpoint, params, attempt + 1);
  }
}

async function localize(lang, titles) {
  if (lang === "en") return Object.fromEntries(titles.map((t) => [t, t]));
  const out = {};
  for (let i = 0; i < titles.length; i += 20) {
    const data = await api(WIKI.en, {
      action: "query", prop: "langlinks", lllang: lang, lllimit: "500",
      redirects: "1", titles: titles.slice(i, i + 20).join("|"),
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

const strip = (t) => t.split("\n").filter((l) => l.trim() && !/^=+.*=+$/.test(l.trim())).join("\n\n");

async function build(lang) {
  const file = join(CACHE, `${lang}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  mkdirSync(CACHE, { recursive: true });
  console.log(`  fetching ${lang} ...`);
  const localized = await localize(lang, TOPICS);
  const items = [];
  for (const [topic, title] of Object.entries(localized)) {
    try {
      const full = await api(WIKI[lang], { action: "query", prop: "extracts", explaintext: "1", redirects: "1", titles: title });
      const intro = await api(WIKI[lang], { action: "query", prop: "extracts", explaintext: "1", exintro: "1", redirects: "1", titles: title });
      const f = Object.values(full.query?.pages ?? {})[0]?.extract;
      const i = Object.values(intro.query?.pages ?? {})[0]?.extract;
      if (!f || !i) continue;
      const body = strip(f.slice(i.length)).slice(0, 9000);
      const lead = strip(i);
      if (lead.split(/\s+/).length < 60 || body.split(/\s+/).length < 200) continue;
      items.push({ topic, title, lead, body });
    } catch {
      // a missing article just drops out of the sample
    }
  }
  writeFileSync(file, JSON.stringify(items));
  return items;
}

const only = process.argv[2];
const langs = only ? [only] : Object.keys(WIKI);
console.log("Lead vs body — the lead section of an article should score easier\n");
for (const lang of langs) {
  let items;
  try {
    items = await build(lang);
  } catch (err) {
    console.error(`${lang}: ${err instanceof Error ? err.message : err}`);
    continue;
  }
  if (items.length < 10) {
    console.log(`${lang}: only ${items.length} usable articles, skipping`);
    continue;
  }
  let correct = 0, sl = 0, sb = 0;
  for (const it of items) {
    const l = scoreText(it.lead, lang), b = scoreText(it.body, lang);
    sl += l.overall_100;
    sb += b.overall_100;
    if (l.overall_100 > b.overall_100) correct++;
  }
  const acc = correct / items.length;
  console.log(
    `  ${lang}  ${String(items.length).padStart(3)} articles  lead easier in ${correct}/${items.length} (${(acc * 100).toFixed(0)}%)  ` +
    `mean lead ${(sl / items.length).toFixed(1)} vs body ${(sb / items.length).toFixed(1)}  gap ${((sl - sb) / items.length).toFixed(1)}`,
  );
}
