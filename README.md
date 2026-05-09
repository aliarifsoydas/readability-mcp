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
- `ai_score(text, language?, models?, llm_weight?)` — score how AI-like a text is. Always runs **six heuristic signals** in the Worker: burstiness (sentence-length variance), AI-tell phrases (multilingual lexicon), fragment-list paragraphs (`X. Y. Z.` runs), parallel structure runs, em-dash overuse, and "not X but Y" rhetorical pattern. If the `OPENROUTER_API_KEY` secret is set, **also runs an LLM judge panel** in parallel (default ensemble: `anthropic/claude-sonnet-4.6` + `openai/gpt-5.4` + `google/gemini-3.1-pro-preview`). Each judge returns a 0-100 score with quoted evidence; the panel surfaces **consensus reasons** (codes flagged by ≥2 judges) and an `agreement` indicator (high/medium/low) based on score variance. Composite combines `heuristic_score * (1-llm_weight) + llm_score * llm_weight` (default `llm_weight=0.6`). Returns `composite_score`, `verdict` (escalated by max signal severity, not just average), per-signal details, `per_sentence` flags, and `summary_advice`.
- `detect_language(text)` — return the detected language code.
- `list_supported_languages()` — list languages, readability metrics, and flow metrics.

All scoring tools return scores **normalized to 0-100** where higher = easier / more fluent.

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
