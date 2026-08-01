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

Set `language: "auto"` (default) for detection: Cyrillic text is resolved by script, Latin-script text by stopword frequency and diacritics.

## Tools

- `score_text(text, language?)` — score raw text. Returns raw `metrics`, normalized `metrics_100`, and an `overall_100` average.
- `score_url(url, language?)` — fetch a webpage, extract main content via `HTMLRewriter`, then score (same shape as `score_text`).
- `flow_score(text, language?)` — score natural flow on three statistical dimensions: sentence-length rhythm, lexical diversity (MATTR), and connective/discourse marker density. Returns each metric on 0-100 plus an overall.
- `seo_score(text, formula?, language?, threshold?, weight_readability?)` — single-formula readability + flow combined for SEO. Returns `passed` boolean, `verdict`, and concrete suggestions in the detected language. Defaults: Flesch for EN, Ateşman for TR, etc; threshold 70; equal weights.
- `ai_score(text, language?, tier?, models?, llm_weight?)` — score how AI-like a text is. Always runs **six heuristic signals** in the Worker: burstiness (sentence-length variance), AI-tell phrases (multilingual lexicon), fragment-list paragraphs (`X. Y. Z.` runs), parallel structure runs, em-dash overuse, and "not X but Y" rhetorical pattern. The `tier` parameter controls the LLM judge panel:
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
- `detect_language(text)` — return the detected language code.
- `list_supported_languages()` — list languages, readability metrics, and flow metrics.

All scoring tools return scores **normalized to 0-100** where higher = easier / more fluent.

## Tests and benchmark

```bash
npm test         # unit + regression suite (no network)
npm run benchmark # validate Russian scoring against a real grade-labelled corpus
```

`npm test` compiles `src/` to `.test-build/` and runs `node --test` over `test/`. It covers tokenization and syllable counting, formula wiring, curve monotonicity and range, language detection, the Russian-specific `ai_score` heuristics, first-class-language parity (judge prompt, UI bundle, lexicon sizes), and degenerate input (empty strings, punctuation, emoji) across every language.

`npm run benchmark` downloads the **Russian Readability Corpus** — Social Studies textbooks for grades 5-11, published with the Dialogue 2018 paper — into `benchmark/corpus/` (gitignored) and checks four things:

1. **Tokenizer** — our ASL/ASW must track the paper's Table 1 (`r = 0.993` / `0.999`). We count words where the paper counts tokens including punctuation, so its ASL runs about one token per sentence higher; the benchmark asserts that gap stays a stable offset instead of drifting.
2. **Ranking** — Spearman correlation between score and grade level, currently **ρ = −0.99** for the combined score and −0.98 or better for each formula on its own.
3. **Grade bands** — grade 5 must land near 90 and grade 11 near 30; every grade is currently within 2 points of its target.
4. **Calibration data** — prints the mean raw value per grade, which is the input for re-fitting the curves in `normalize.ts` if the tokenizer ever changes.

The benchmark depends on an external download, so CI runs it as an advisory job; the calibration itself is pinned in the unit suite so a regression fails `npm test` regardless.

## Browse the tool catalog

- `GET /docs` — human-readable HTML page documenting every tool, its parameters, output shape, and example request/response. Auto-rendered when a browser opens `/`.
- `GET /openapi.json` — OpenAPI 3.1 spec describing each tool's input/output. Useful for tool generators and AI clients that consume schemas.
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
- Russian coefficients come from Ivanov, Solnyshkina & Solovyev, *Efficiency of Text Readability Features in Russian Academic Texts* (Dialogue 2018), §2. Their raw scales are not Flesch scales — Oborneva scores a 5th grade textbook around +43 and an 11th grade one around −12 on this tokenizer — so the 0-100 normalization is fitted to that paper's grade-level corpus rather than to the English bands. See `npm run benchmark`.
- Two heuristics are language-aware for Russian specifically: the em-dash signal in `ai_score` is scored far more leniently, because the dash is a grammatical copula there (*Москва — столица России*), and the sentence-fragment check accepts verbless predicates, because Russian drops the present-tense copula (*Он врач.* is a complete sentence).
- The Russian fragment check keys on the missing predicate rather than on a determiner, because Russian has no articles and its LLM bullet fragments are bare noun phrases (*Экономия времени.*) that no suffix list covers. Two collisions had to be handled: the `-ость` noun suffix ends in `ть` exactly like an infinitive, and abbreviations (*лезг.*, *совр.*) make the sentence splitter cut mid-clause, so fragment candidates must start with a capital.

### What `ai_score` heuristics do and do not catch

Measured on Russian: real human prose (grade 5-11 textbooks, six Wikipedia articles) scores **1-8**, while unedited LLM article and marketing copy scores **44-58** — a clean 37-point gap, with zero false fragment runs on the human side.

The same measurement shows the limit. LLM text rewritten in a natural voice — no stock openers, varied sentence length — scores **2-13**, indistinguishable from human. Four of the six heuristic signals are phrase and structure matchers, so they detect *unedited LLM boilerplate*, not authorship. Treat a low heuristic score as "no boilerplate found", not as "written by a human", and use the LLM judge panel (`tier: "cheap"` / `"premium"`) when the question is actually authorship.
