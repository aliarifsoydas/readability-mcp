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

## Notes

- Public, unauthenticated by default. Add `workers-oauth-provider` if you need auth.
- `score_url` uses Workers' native `HTMLRewriter` for content extraction — no DOM polyfill, zero extra deps.
- Syllable counting uses language-specific vowel patterns; English uses an additional consonant-cluster heuristic.
