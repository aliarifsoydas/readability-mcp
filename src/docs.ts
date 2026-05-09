export interface ParamDoc {
  name: string;
  type: string;
  required: boolean;
  description: string;
  default?: string;
  enum?: string[];
}

export interface ToolDoc {
  name: string;
  summary: string;
  description: string;
  params: ParamDoc[];
  output_summary: string;
  cost?: string;
  example_request: object;
  example_response_excerpt: object;
}

export const TOOLS: ToolDoc[] = [
  {
    name: "score_text",
    summary: "Multilingual readability scoring of raw text.",
    description:
      "Runs the language's standard readability formulas (Flesch for EN, Ateşman for TR, etc) and returns both raw values and a 0-100 normalized score where higher = easier to read.",
    params: [
      { name: "text", type: "string", required: true, description: "Text to analyze." },
      { name: "language", type: "string", required: false, description: "Language code or 'auto'.", default: "auto", enum: ["auto", "en", "tr", "es", "de", "fr", "it"] },
    ],
    output_summary: "{ language, metrics, metrics_100, overall_100 }",
    example_request: { text: "Bu çok kısa bir Türkçe cümledir.", language: "auto" },
    example_response_excerpt: { language: "tr", metrics: { atesman: 78.5 }, metrics_100: { atesman: 78.5 }, overall_100: 78.5 },
  },
  {
    name: "score_url",
    summary: "Fetch a URL, extract main content, and score its readability.",
    description:
      "Uses Cloudflare Workers' native HTMLRewriter to extract main text from the page (no headless browser, no DOM polyfill), then runs `score_text` on the extracted content. Returns the same shape as `score_text` plus url/title/text_preview.",
    params: [
      { name: "url", type: "string", required: true, description: "Webpage to fetch." },
      { name: "language", type: "string", required: false, description: "Language code or 'auto'.", default: "auto", enum: ["auto", "en", "tr", "es", "de", "fr", "it"] },
    ],
    output_summary: "{ url, title, text_preview, language, metrics, metrics_100, overall_100 }",
    example_request: { url: "https://example.com/article" },
    example_response_excerpt: { url: "https://example.com/article", title: "...", overall_100: 64.2 },
  },
  {
    name: "flow_score",
    summary: "Natural-flow score on three statistical axes.",
    description:
      "Independent of formula-based readability. Measures: (a) rhythm — coefficient of variation of sentence lengths (low=monotone, very high=erratic, ~0.5 optimal), (b) lexical diversity — moving-average type-token ratio over a 50-token window, (c) connective density — discourse-marker hits per sentence. Returns each on 0-100 plus an overall.",
    params: [
      { name: "text", type: "string", required: true, description: "Text to analyze." },
      { name: "language", type: "string", required: false, description: "Language code or 'auto'.", default: "auto", enum: ["auto", "en", "tr", "es", "de", "fr", "it"] },
    ],
    output_summary: "{ language, overall_100, metrics_100: { rhythm, lexical_diversity, connective_density }, details, interpretation }",
    example_request: { text: "Cümle bir. Cümle iki. Cümle üç." },
    example_response_excerpt: { overall_100: 32.1, metrics_100: { rhythm: 0, lexical_diversity: 60, connective_density: 36 }, interpretation: "Düşük akış" },
  },
  {
    name: "seo_score",
    summary: "Single-formula readability + flow combined for SEO publishing decisions.",
    description:
      "Picks one readability formula (default per language) and combines it with `flow_score` using configurable weights. Returns a `passed` boolean against a threshold and concrete localized suggestions (TR/EN bundles fully populated; ES/DE/FR/IT have basic bundles).",
    params: [
      { name: "text", type: "string", required: true, description: "Text to analyze." },
      { name: "formula", type: "string", required: false, description: "Override readability formula. Defaults: Flesch (EN), Ateşman (TR), Fernández-Huerta (ES), Flesch-Deutsch (DE), Kandel-Moles (FR), Gulpease (IT)." },
      { name: "language", type: "string", required: false, description: "Language code or 'auto'.", default: "auto" },
      { name: "threshold", type: "number", required: false, description: "Pass threshold on the 0-100 scale.", default: "70" },
      { name: "weight_readability", type: "number", required: false, description: "Weight of readability vs flow in overall score (0-1).", default: "0.5" },
    ],
    output_summary: "{ formula, threshold, weights, readability_100, flow_100, overall_100, passed, verdict, suggestions, breakdown }",
    example_request: { text: "Buraya analiz edilecek bir Türkçe metin gelir...", threshold: 70 },
    example_response_excerpt: { formula: "atesman", overall_100: 65.3, passed: false, verdict: "Akış zayıf: cümle uzunluklarını çeşitlendir", suggestions: ["Kısa ve uzun cümleleri sırala — monoton ritimden kaçın"] },
  },
  {
    name: "ai_score",
    summary: "AI-likeness score with explainable reasons + optional LLM judge panel.",
    description:
      "Six heuristic signals always run inside the Worker (free, ms-fast): burstiness, AI-tell phrases (EN+TR lexicons), fragment-list paragraphs, parallel structure runs, em-dash overuse, and \"not X but Y\" patterns. Each signal returns a `reason` with severity, explanation, evidence and location. The optional LLM panel adds 3 frontier models in parallel via OpenRouter, surfacing consensus reasons (codes flagged by ≥2 judges) with quoted evidence. Composite blends heuristic and LLM scores; verdict escalates by max signal severity so a single high-severity finding isn't drowned out.",
    cost:
      "tier=heuristic → $0 / ~5ms · tier=cheap → ~$0.012 / ~10s · tier=premium → ~$0.066 / ~25s. LLM tiers require OPENROUTER_API_KEY secret. Output includes total_cost_usd per panel call.",
    params: [
      { name: "text", type: "string", required: true, description: "Text to score." },
      { name: "language", type: "string", required: false, description: "Language code or 'auto'.", default: "auto", enum: ["auto", "en", "tr", "es", "de", "fr", "it"] },
      { name: "tier", type: "string", required: false, description: "Scoring tier.", default: "heuristic", enum: ["heuristic", "cheap", "premium"] },
      { name: "models", type: "string[]", required: false, description: "Override the panel with custom OpenRouter model IDs. Implies LLM use; ignores `tier` if non-empty." },
      { name: "llm_weight", type: "number", required: false, description: "Weight of LLM panel score vs heuristic in composite_score (0-1).", default: "0.6" },
    ],
    output_summary: "{ composite_score, verdict, heuristic_score, llm_score?, signals: { burstiness, ai_phrases, fragment_lists, parallel_structure, em_dash, not_x_but_y, llm_panel? }, reasons[], per_sentence[], summary_advice[], stats }",
    example_request: { text: "The meeting point address. The meeting time. A map link...", tier: "cheap" },
    example_response_excerpt: {
      composite_score: 41.6,
      verdict: "very_likely_ai",
      heuristic_score: 22.5,
      llm_score: 54.33,
      reasons: [{ code: "fragment_list_paragraph", severity: "high", explanation: "1 paragrafta ardışık fragman dizilimi tespit edildi" }],
      summary_advice: ["Convert the consecutive fragment paragraph into a flowing sentence"],
    },
  },
  {
    name: "detect_language",
    summary: "Detect the language of a given text.",
    description: "Stopword-frequency + diacritic heuristic across the 6 supported languages. Fast, deterministic, no external calls.",
    params: [{ name: "text", type: "string", required: true, description: "Text to detect language of." }],
    output_summary: "{ language: 'en' | 'tr' | 'es' | 'de' | 'fr' | 'it' }",
    example_request: { text: "Bu bir Türkçe cümledir." },
    example_response_excerpt: { language: "tr" },
  },
  {
    name: "list_supported_languages",
    summary: "Meta tool: enumerate languages, readability formulas per language, and flow metrics.",
    description: "Useful for client UIs to populate language pickers and explain available scoring options.",
    params: [],
    output_summary: "{ languages, metrics_by_language, flow_metrics, note }",
    example_request: {},
    example_response_excerpt: { languages: ["en", "tr", "es", "de", "fr", "it"], flow_metrics: ["rhythm", "lexical_diversity", "connective_density"] },
  },
];

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function paramRow(p: ParamDoc): string {
  const req = p.required ? '<span class="req">required</span>' : '<span class="opt">optional</span>';
  const def = p.default ? `<code class="default">default: ${escapeHtml(p.default)}</code>` : "";
  const en = p.enum ? `<code class="enum">${p.enum.map(escapeHtml).join(" · ")}</code>` : "";
  return `
    <tr>
      <td><code>${escapeHtml(p.name)}</code></td>
      <td><code class="type">${escapeHtml(p.type)}</code></td>
      <td>${req}</td>
      <td>${escapeHtml(p.description)} ${def} ${en}</td>
    </tr>`;
}

function toolSection(t: ToolDoc): string {
  const params = t.params.length === 0
    ? '<p class="muted">No parameters.</p>'
    : `<table>
         <thead><tr><th>Name</th><th>Type</th><th></th><th>Description</th></tr></thead>
         <tbody>${t.params.map(paramRow).join("")}</tbody>
       </table>`;
  const cost = t.cost ? `<div class="cost"><b>Cost:</b> ${escapeHtml(t.cost)}</div>` : "";
  return `
    <section id="${t.name}">
      <h2><code>${t.name}</code></h2>
      <p class="summary">${escapeHtml(t.summary)}</p>
      <p>${escapeHtml(t.description)}</p>
      ${cost}
      <h3>Parameters</h3>
      ${params}
      <h3>Output shape</h3>
      <pre><code>${escapeHtml(t.output_summary)}</code></pre>
      <h3>Example</h3>
      <div class="example">
        <div>
          <p class="muted">Request</p>
          <pre><code>${escapeHtml(JSON.stringify(t.example_request, null, 2))}</code></pre>
        </div>
        <div>
          <p class="muted">Response (excerpt)</p>
          <pre><code>${escapeHtml(JSON.stringify(t.example_response_excerpt, null, 2))}</code></pre>
        </div>
      </div>
    </section>`;
}

const STYLES = `
  :root { color-scheme: light dark; --bg: #ffffff; --fg: #1a1a1a; --muted: #6b7280; --border: #e5e7eb; --accent: #2563eb; --code-bg: #f3f4f6; --req: #dc2626; --opt: #6b7280; }
  @media (prefers-color-scheme: dark) { :root { --bg: #0a0a0a; --fg: #e5e7eb; --muted: #9ca3af; --border: #262626; --accent: #60a5fa; --code-bg: #171717; --req: #f87171; --opt: #9ca3af; } }
  * { box-sizing: border-box; }
  body { font-family: ui-sans-serif, -apple-system, system-ui, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 0; background: var(--bg); color: var(--fg); line-height: 1.55; }
  .wrap { max-width: 980px; margin: 0 auto; padding: 2rem 1.5rem 4rem; }
  header { padding-bottom: 1.5rem; border-bottom: 1px solid var(--border); margin-bottom: 2rem; }
  header h1 { margin: 0 0 0.25rem; font-size: 1.75rem; }
  header p { margin: 0; color: var(--muted); }
  nav { margin: 1rem 0 2rem; padding: 1rem; background: var(--code-bg); border-radius: 8px; }
  nav strong { display: block; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); margin-bottom: 0.5rem; }
  nav a { display: inline-block; margin: 0.15rem 0.5rem 0.15rem 0; color: var(--accent); text-decoration: none; }
  nav a:hover { text-decoration: underline; }
  section { padding: 2rem 0; border-bottom: 1px solid var(--border); }
  section:last-child { border-bottom: 0; }
  h2 { margin: 0 0 0.5rem; font-size: 1.4rem; }
  h2 code { background: var(--code-bg); padding: 0.15rem 0.5rem; border-radius: 4px; }
  h3 { margin: 1.25rem 0 0.5rem; font-size: 0.95rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }
  .summary { font-weight: 500; margin: 0 0 0.75rem; }
  table { width: 100%; border-collapse: collapse; margin: 0.5rem 0; font-size: 0.92rem; }
  th, td { text-align: left; padding: 0.5rem 0.6rem; border-bottom: 1px solid var(--border); vertical-align: top; }
  th { color: var(--muted); font-weight: 500; font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.04em; }
  code { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: 0.88em; background: var(--code-bg); padding: 0.1rem 0.35rem; border-radius: 3px; }
  pre { margin: 0.5rem 0; padding: 1rem; background: var(--code-bg); border-radius: 6px; overflow-x: auto; font-size: 0.86rem; }
  pre code { background: transparent; padding: 0; }
  .req { display: inline-block; padding: 0.05rem 0.4rem; background: rgba(220, 38, 38, 0.1); color: var(--req); border-radius: 3px; font-size: 0.75rem; font-weight: 500; }
  .opt { display: inline-block; padding: 0.05rem 0.4rem; background: rgba(107, 114, 128, 0.1); color: var(--opt); border-radius: 3px; font-size: 0.75rem; }
  .default, .enum { display: inline-block; margin-top: 0.25rem; font-size: 0.78rem; color: var(--muted); }
  .cost { margin: 0.5rem 0; padding: 0.6rem 0.8rem; background: rgba(37, 99, 235, 0.08); border-left: 3px solid var(--accent); border-radius: 4px; font-size: 0.92rem; }
  .example { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
  @media (max-width: 640px) { .example { grid-template-columns: 1fr; } }
  .muted { color: var(--muted); margin: 0 0 0.25rem; font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.04em; }
  footer { margin-top: 3rem; padding-top: 1.5rem; border-top: 1px solid var(--border); color: var(--muted); font-size: 0.88rem; }
  footer code { font-size: 0.85em; }
  .endpoints { display: flex; gap: 1rem; flex-wrap: wrap; margin: 0.5rem 0; }
  .endpoints code { padding: 0.3rem 0.6rem; }
`;

export function renderDocsHtml(): string {
  const tools = TOOLS;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>readability-mcp · tool docs</title>
<style>${STYLES}</style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1>readability-mcp</h1>
      <p>Multilingual readability, flow, SEO, and AI-detection scoring as an MCP server on Cloudflare Workers.</p>
      <div class="endpoints">
        <code>POST /mcp</code> <code>GET/POST /sse</code> <code>GET /docs</code> <code>GET /openapi.json</code>
      </div>
    </header>

    <nav>
      <strong>Tools</strong>
      ${tools.map((t) => `<a href="#${t.name}"><code>${t.name}</code></a>`).join(" ")}
    </nav>

    ${tools.map(toolSection).join("")}

    <footer>
      <p>This server speaks <strong>Model Context Protocol</strong>. Tools are invoked via JSON-RPC <code>tools/call</code> on the <code>/mcp</code> endpoint, not as REST.</p>
      <p>Source: <a href="https://github.com/aliarifsoydas/readability-mcp">github.com/aliarifsoydas/readability-mcp</a></p>
    </footer>
  </div>
</body>
</html>`;
}

export function renderOpenApi(): object {
  return {
    openapi: "3.1.0",
    info: {
      title: "readability-mcp",
      version: "0.1.0",
      description:
        "Multilingual readability, flow, SEO and AI-detection scoring. Tools are exposed via the Model Context Protocol on /mcp; this OpenAPI doc describes their semantics for human/tooling reference.",
    },
    servers: [{ url: "/", description: "MCP transport — call via JSON-RPC tools/call on /mcp" }],
    paths: Object.fromEntries(
      TOOLS.map((t) => [
        `/mcp/tools/${t.name}`,
        {
          post: {
            summary: t.summary,
            description: t.description + (t.cost ? `\n\nCost: ${t.cost}` : ""),
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: Object.fromEntries(
                      t.params.map((p) => [
                        p.name,
                        {
                          type: p.type.endsWith("[]") ? "array" : p.type === "number" ? "number" : "string",
                          description: p.description,
                          default: p.default,
                          enum: p.enum,
                        },
                      ]),
                    ),
                    required: t.params.filter((p) => p.required).map((p) => p.name),
                  },
                  example: t.example_request,
                },
              },
            },
            responses: {
              "200": {
                description: "Success",
                content: {
                  "application/json": { example: t.example_response_excerpt },
                },
              },
            },
          },
        },
      ]),
    ),
  };
}
