# readability-mcp

A Model Context Protocol (MCP) server that scores text readability in multiple languages. Runs on Cloudflare Workers as a remote MCP server.

## Supported languages and metrics

| Language | Metrics |
|---|---|
| English (`en`) | Flesch Reading Ease, Flesch-Kincaid Grade, Gunning Fog, SMOG, Coleman-Liau, ARI |
| Turkish (`tr`) | Ateşman, Bezirci-Yılmaz, Çetinkaya-Uzun |
| Spanish (`es`) | Fernández-Huerta, Szigriszt-Pazos |
| German (`de`) | Flesch (Deutsch), Wiener Sachtextformel |
| French (`fr`) | Kandel-Moles |
| Italian (`it`) | Gulpease |
| Russian (`ru`) | Оборнева (Oborneva), Мацковский (Matskovskiy), Тулдава (Tuldava) |
| Arabic (`ar`) | AWL-ASL index, Arabic ARI |

Set `language: "auto"` (default) for detection: Arabic and Cyrillic text is resolved by script, Latin-script text by stopword frequency and diacritics.

## Tools

- `score_text(text, language?)` — score raw text. Returns raw `metrics`, normalized `metrics_100`, and an `overall_100` average.
- `score_url(url, language?)` — fetch a webpage, extract main content via `HTMLRewriter`, then score (same shape as `score_text`).
- `flow_score(text, language?)` — score natural flow on three statistical dimensions: sentence-length rhythm, lexical diversity (MATTR), and connective/discourse marker density. Returns each metric on 0-100 plus an overall.
- `seo_score(text, formula?, language?, threshold?, weight_readability?)` — single-formula readability + flow combined for SEO. Returns `passed` boolean, `verdict`, and concrete suggestions in the detected language. Defaults: Flesch for EN, Ateşman for TR, etc; threshold 70; equal weights.
- `ai_score(text, language?, tier?, models?, llm_weight?)` — score how AI-like a text is. Always runs **six heuristic signals** in the Worker: burstiness (sentence-length variance), AI-tell phrases (EN/TR/RU lexicons), fragment-list paragraphs (`X. Y. Z.` runs), parallel structure runs, em-dash overuse, and the "not X but Y" rhetorical pattern — including multi-item runs (*not A, not B, not C — but D*), which are counted separately because they weigh more than a two-part antithesis. The `tier` parameter controls the LLM judge panel:
  - `tier: "heuristic"` (default) — heuristics only, ~5ms, **$0**
  - `tier: "cheap"` — adds a 3-model ensemble (`claude-haiku-4.5` + `gpt-5.4-mini` + `gemini-3.1-flash-lite`), ~10s, **~$0.012/call**
  - `tier: "premium"` — adds a frontier ensemble (`claude-sonnet-4.6` + `gpt-5.4` + `gemini-3.1-pro-preview`), ~25s, **~$0.066/call**
  - Or pass `models: [...]` for a custom panel.

  Both LLM tiers require `OPENROUTER_API_KEY` as a Worker secret. Each judge returns a 0-100 score with quoted evidence; the panel surfaces **consensus reasons** (codes flagged by ≥2 judges) and an `agreement` indicator (high/medium/low) from score variance. Composite blends `heuristic_score * (1-llm_weight) + llm_score * llm_weight` (default `llm_weight=0.6`). Output includes `total_cost_usd` per panel call for budget tracking. Verdict escalates by max signal severity, so a single high-severity finding isn't drowned out by averaging.

  **Recommended pipeline pattern for iterative humanization:**
  ```
  while not passing:
      result = ai_score(text)                    # heuristic, free
      if result.composite_score < 30:
          break                                  # heuristic clean enough to test deeper
      # apply targeted fixes from result.summary_advice
  result = ai_score(text, tier="cheap")          # mid-tier check
  if result.composite_score < 35:
      result = ai_score(text, tier="premium")    # final QA
  ```
  Typical cost: **$0.012–0.08 per article** depending on how often premium runs.
- `grammar_check(text)` — **Turkish only.** Rule-based orthography check returning located findings with suggested corrections. Free, in-Worker, no LLM. See below for what it does and does not check.
- `detect_language(text)` — return the detected language code.
- `list_supported_languages()` — list languages, readability metrics, and flow metrics.

All scoring tools return scores **normalized to 0-100** where higher = easier / more fluent.

## Tests and benchmark

```bash
npm test               # unit + regression suite (no network)
npm run benchmark      # every language
npm run benchmark:ru   # Russian — grade 5-11 textbooks
npm run benchmark:ar   # Arabic — BAREC's 19 annotated levels
npm run benchmark:paired  # en/es/fr/it/de — children's vs adult encyclopedia
npm run benchmark:tr   # Turkish — register separation
```

`npm test` compiles `src/` to `.test-build/` and runs `node --test` over `test/`. It covers tokenization and syllable counting, formula wiring, curve monotonicity and range, language detection, the language-specific `ai_score` heuristics, first-class-language parity (judge prompt, UI bundle, lexicon sizes), the antithesis patterns, documentation drift, and degenerate input across every language.

### Every supported language is validated against real data

| | evidence | result |
|---|---|---|
| `ru` | Russian Readability Corpus — 14 textbooks, grades 5-11 | **ρ = −0.99** with grade level; every grade band within 2 points |
| `ar` | BAREC — 1330 documents on a 19-level scale | **ρ = 0.77** with a document's average level; bands within 5 points |
| `en` | Simple English Wikipedia vs English Wikipedia, 60 topics | **100%** of pairs ordered correctly, mean gap 24.6 |
| `de` | Klexikon vs German Wikipedia, 55 topics | **98%**, gap 23.4 |
| `es` | Vikidia vs Spanish Wikipedia, 52 topics | **98%**, gap 15.6 |
| `fr` | Vikidia vs French Wikipedia, 59 topics | **98%**, gap 15.8 |
| `it` | Vikidia vs Italian Wikipedia, 47 topics | **91%**, gap 8.4 |
| `tr` | Wikisource folk tales vs statutes | **100%** separation, gap 41.2 — coarse, see below |

The paired benchmark is the strongest design available without a graded corpus: both halves of a pair cover the same subject in the same language, so the only thing left for the scorer to see is how the text is written. It is ordinal, which means it needs no calibrated scale to be meaningful.

Italian is the weakest of the five. It ships a single formula (Gulpease) on an identity curve, and its 8-point gap leaves less headroom than the others.

Turkish has no freely available graded corpus and no children's encyclopedia, so it gets a two-class separation instead. Take it for what it is: a fairy tale and a legal code are far enough apart that any scorer which is not actively broken will separate them, so this catches a dead formula but cannot certify calibration. A Wikipedia lead-vs-body proxy was tried first and **rejected** — on English, where the paired benchmark scores 100%, that proxy scored 39%, so its premise was wrong rather than the scorer. It is kept in `benchmark/lead-body.mjs` as a documented negative result.

### Why Arabic ships only two formulas

Arabic is written without short vowels, so its syllables are not recoverable from the text and every formula built on counting them collapses. Measured on BAREC:

| formula | ρ | |
|---|---|---|
| OSMAN | **+0.05** | its complex-word term needs four diacritics per word and is exactly 0 in most documents |
| Arabic Flesch | +0.16 | syllables per word |
| Arabic Kincaid | −0.11 | syllables per word |
| Arabic LIX | +0.66 | usable, but its level anchors are not monotone |
| Arabic ARI | +0.76 | characters per word — no syllables needed |
| AWL × lg(ASL) | **+0.78** | shipped as the default |

For reference, `textstat` — the usual off-the-shelf choice — scores −0.54 on the same data, and only because its syllable counter is inert on Arabic, which degenerates Flesch into a sentence-length proxy. OSMAN and the two syllable-based formulas are deliberately absent rather than carried for the sake of citing them.

Two limitations worth stating. The scorer measures **average** difficulty; BAREC's own document label is the level of a document's single hardest sentence, which a surface average cannot predict (ρ 0.62 against that target versus 0.77 against average difficulty). And **fragment detection is disabled for Arabic**: the nominal sentence carries no verb and is a complete, very common construction — *العلم نور* is a full sentence — so a determiner-keyed rule flags 7.8% of ordinary short sentences, about half of them grammatical. The same call was made for Turkish, for the same reason.

### Turkish grammar rules

`grammar_check` ships three rules. Each was measured against the **42,449 attested example sentences in the TDK dictionary** — text that is correct by definition, so every hit there is a false positive — and only rules under 0.5% were kept.

| rule | false positives | |
|---|---|---|
| `kesme_isareti_tutarsiz` | 0.08% | straight `'` and typographic `’` mixed in one document |
| `ek_uyumu` | 0.41% | a suffix that disagrees with the stem's last vowel (*kitapler* → *kitaplar*) |
| `baglac_ki_bitisik` | 0.02% | the conjunction *ki* written joined (*demekki* → *demek ki*) |

Two rules were measured and **deliberately excluded**:

- **Question particle** (0.66%) — *kendimi*, *fikrimi* are accusatives, not questions, and separating them needs to know the stem is a verb, which a lemma list cannot say.
- **da/de conjunction** (6.43%) — the famous one. *okulda* as a locative and *okul da* as a conjunction are both correct, and nothing in the morphology distinguishes them; only meaning does. It belongs to a semantic tier, not here.

Recall is limited by design. The harmony rule is anchored at the end of the word: letting the suffix sit mid-word to catch *defter+ler+i* was measured and took false positives from 0.41% to 2.34%, so an error is only caught when the harmony suffix is the last one. Turkish is agglutinative and the lexicon holds lemmas, so errors on inflected stems (*yorgundumki*) are missed.

The lexicon is generated from a local copy of the TDK Güncel Türkçe Sözlük and **is not in this repository**:

```bash
npm run build:lexicon -- /path/to/v12.gts.sqlite3.db   # writes src/grammar/tr-lexicon.generated.ts
npm run benchmark:grammar -- /path/to/v12.gts.sqlite3.db
```

Without it, `grammar_check` still runs the apostrophe rule and reports the rest in `skipped_rules` rather than silently passing.

## Browse the tool catalog

- `GET /docs` — human-readable HTML page documenting every tool, its parameters, output shape, full response schema, and example request/response. Auto-rendered when a browser opens `/`.
- `GET /openapi.json` — OpenAPI 3.1 spec describing each tool's input **and a full JSON Schema for its response**, down to the shape of every `ai_score` signal. Useful for tool generators and AI clients that consume schemas. The suite checks these schemas against live tool output, so a renamed or added field fails the build rather than drifting.
- `GET /` (with `Accept: application/json`) — short JSON manifest with endpoint URLs and tool names.

## Deploy to Cloudflare

### Option A — connect this GitHub repo to Cloudflare (no CLI needed)

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Import a repository**.
2. Select this repo. Cloudflare detects `wrangler.jsonc`.
3. Build command: leave empty. Deploy command: `npx wrangler deploy`.
4. Click **Deploy**.

Your MCP endpoint will be:
```
https://readability-mcp.<your-subdomain>.workers.dev/mcp
```

### Option B — deploy from CLI

```bash
npm install
npx wrangler login
npx wrangler deploy
```

## Connect from an MCP client

### Claude Desktop / Claude Code (via mcp-remote bridge)

```json
{
  "mcpServers": {
    "readability": {
      "command": "npx",
      "args": ["mcp-remote", "https://readability-mcp.<your-subdomain>.workers.dev/sse"]
    }
  }
}
```

### Cursor / native Streamable HTTP clients

```json
{
  "mcpServers": {
    "readability": {
      "url": "https://readability-mcp.<your-subdomain>.workers.dev/mcp"
    }
  }
}
```

## Local dev

```bash
npm install
npm run dev
```

Then test with:
```bash
curl http://localhost:8787/
```

## Optional: enable the LLM judge panel for `ai_score`

```bash
npx wrangler secret put OPENROUTER_API_KEY
# paste your sk-or-... key
```

Without the secret, `ai_score` returns heuristic-only results. With it, the tool runs the heuristic + a 3-model OpenRouter panel in parallel. Override the panel via the `models` parameter when calling the tool.

## Notes

- Public, unauthenticated by default. Add `workers-oauth-provider` if you need auth.
- `score_url` uses Workers' native `HTMLRewriter` for content extraction — no DOM polyfill, zero extra deps.
- Syllable counting uses language-specific vowel patterns; English uses an additional consonant-cluster heuristic.
- Arabic normalization strips the optional diacritics and unifies the interchangeable letter shapes before anything is counted. This is load-bearing, not cosmetic: the same sentence written with full tashkeel has about twice the characters of its plain form, which would double every character-based measurement.
- Russian coefficients come from Ivanov, Solnyshkina & Solovyev, *Efficiency of Text Readability Features in Russian Academic Texts* (Dialogue 2018), §2. Their raw scales are not Flesch scales — Oborneva scores a 5th grade textbook around +43 and an 11th grade one around −12 on this tokenizer — so the 0-100 normalization is fitted to that paper's grade-level corpus rather than to the English bands. See `npm run benchmark`.
- Two heuristics are language-aware for Russian specifically: the em-dash signal in `ai_score` is scored far more leniently, because the dash is a grammatical copula there (*Москва — столица России*), and the sentence-fragment check accepts verbless predicates, because Russian drops the present-tense copula (*Он врач.* is a complete sentence).
- The Russian fragment check keys on the missing predicate rather than on a determiner, because Russian has no articles and its LLM bullet fragments are bare noun phrases (*Экономия времени.*) that no suffix list covers. Two collisions had to be handled: the `-ость` noun suffix ends in `ть` exactly like an infinitive, and abbreviations (*лезг.*, *совр.*) make the sentence splitter cut mid-clause, so fragment candidates must start with a capital.

### What `ai_score` heuristics do and do not catch

Measured on Russian: real human prose (grade 5-11 textbooks, six Wikipedia articles) scores **1-8**, while unedited LLM article and marketing copy scores **44-58** — a clean 37-point gap, with zero false fragment runs on the human side.

The same measurement shows the limit. LLM text rewritten in a natural voice — no stock openers, varied sentence length — scores **2-13**, indistinguishable from human. Four of the six heuristic signals are phrase and structure matchers, so they detect *unedited LLM boilerplate*, not authorship. Treat a low heuristic score as "no boilerplate found", not as "written by a human", and use the LLM judge panel (`tier: "cheap"` / `"premium"`) when the question is actually authorship.

**Known gap:** English and Turkish fragment detection keys on a determiner, so noun-phrase bullet lists (*Fast delivery. Time savings.* / *Esnek saatler. Zaman tasarrufu.*) are not caught. Russian solves this by keying on the missing predicate instead, but that does not transfer: applying it to Turkish produced a **25.6% false-positive rate** on human prose (49% on Wikipedia), because Turkish nominal sentences take no overt copula (*Hava güzel.*). Closing this properly needs a real predicate detector per language.

