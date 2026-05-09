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

Set `language: "auto"` (default) for stopword-based detection.

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
