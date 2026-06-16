import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { scoreText, SUPPORTED_LANGUAGES, detectLanguage } from "./scorers/index.js";
import { extractFromUrl } from "./extract.js";
import { flowScore } from "./flow.js";
import { seoScore, SUPPORTED_FORMULAS, type Formula } from "./seo.js";
import { aiDetectScore } from "./aidetect.js";
import { renderDocsHtml, renderOpenApi } from "./docs.js";
import { checkAuth, renderUiHtml } from "./ui.js";
import type { PanelTier } from "./llm_panel.js";

const LANG_ENUM = z.enum(["auto", ...SUPPORTED_LANGUAGES] as ["auto", ...typeof SUPPORTED_LANGUAGES]);

export class ReadabilityMCP extends McpAgent {
  server = new McpServer({
    name: "readability-mcp",
    version: "0.1.0",
  });

  async init() {
    this.server.tool(
      "score_text",
      {
        text: z.string().min(1).describe("The text to analyze."),
        language: LANG_ENUM.optional().describe(
          "Language code: en, tr, es, de, fr, it, or 'auto' (default).",
        ),
      },
      async ({ text, language }) => {
        const result = scoreText(text, language ?? "auto");
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      },
    );

    this.server.tool(
      "score_url",
      {
        url: z.string().url().describe("The URL of a webpage to fetch and score."),
        language: LANG_ENUM.optional().describe(
          "Language code: en, tr, es, de, fr, it, or 'auto' (default).",
        ),
      },
      async ({ url, language }) => {
        const page = await extractFromUrl(url);
        if (!page.text) {
          return {
            content: [
              { type: "text", text: JSON.stringify({ error: "No extractable text content.", url: page.url }, null, 2) },
            ],
            isError: true,
          };
        }
        const result = scoreText(page.text, language ?? "auto");
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  url: page.url,
                  title: page.title,
                  text_preview: page.text.slice(0, 500),
                  ...result,
                },
                null,
                2,
              ),
            },
          ],
        };
      },
    );

    this.server.tool(
      "flow_score",
      {
        text: z.string().min(1).describe("The text to analyze for natural flow."),
        language: LANG_ENUM.optional().describe(
          "Language code: en, tr, es, de, fr, it, or 'auto' (default).",
        ),
      },
      async ({ text, language }) => {
        const result = flowScore(text, language ?? "auto");
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      },
    );

    this.server.tool(
      "seo_score",
      {
        text: z.string().min(1).describe("The text to analyze for SEO."),
        formula: z
          .enum(SUPPORTED_FORMULAS as unknown as [string, ...string[]])
          .optional()
          .describe(
            "Single readability formula to use. If omitted, uses the language's default (Flesch for EN, Ateşman for TR, etc).",
          ),
        language: LANG_ENUM.optional().describe(
          "Language code: en, tr, es, de, fr, it, or 'auto' (default).",
        ),
        threshold: z
          .number()
          .min(0)
          .max(100)
          .optional()
          .describe("Pass threshold on the 0-100 scale. Default 70."),
        weight_readability: z
          .number()
          .min(0)
          .max(1)
          .optional()
          .describe(
            "Weight given to readability vs flow when computing overall_100. Default 0.5 (equal).",
          ),
      },
      async ({ text, formula, language, threshold, weight_readability }) => {
        try {
          const result = seoScore(text, {
            formula: formula as Formula | undefined,
            language,
            threshold,
            weight_readability,
          });
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        } catch (err) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  { error: err instanceof Error ? err.message : String(err) },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      },
    );

    this.server.tool(
      "ai_score",
      {
        text: z.string().min(1).describe("The text to score for AI-likeness."),
        language: LANG_ENUM.optional().describe(
          "Language code: en, tr, es, de, fr, it, or 'auto' (default).",
        ),
        tier: z
          .enum(["heuristic", "cheap", "premium"])
          .optional()
          .describe(
            "Scoring tier. 'heuristic' (default) = free, ms-fast, signal-rich pattern matching. 'cheap' = adds 3-model OpenRouter ensemble (~$0.01/call). 'premium' = adds frontier ensemble (~$0.06/call). Both tiers require OPENROUTER_API_KEY.",
          ),
        models: z
          .array(z.string())
          .optional()
          .describe(
            "Override the panel with specific OpenRouter model IDs (e.g. ['openai/gpt-5.4-mini']). Implies LLM panel; ignores 'tier' if provided.",
          ),
        llm_weight: z
          .number()
          .min(0)
          .max(1)
          .optional()
          .describe("Weight of LLM panel score vs heuristic in composite_score. Default 0.6. Only relevant when an LLM tier is used."),
      },
      async ({ text, language, tier, models, llm_weight }) => {
        const env = (this as unknown as { env: Env }).env;
        const apiKey = env.OPENROUTER_API_KEY;
        const useLlm = apiKey && ((tier && tier !== "heuristic") || (models && models.length > 0));
        const result = await aiDetectScore(text, {
          language,
          llm: useLlm
            ? {
                apiKey,
                tier: tier === "cheap" || tier === "premium" ? tier : undefined,
                models,
                weight: llm_weight,
              }
            : undefined,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      },
    );

    this.server.tool(
      "detect_language",
      {
        text: z.string().min(1).describe("Text to detect language of."),
      },
      async ({ text }) => {
        const lang = detectLanguage(text);
        return {
          content: [{ type: "text", text: JSON.stringify({ language: lang }, null, 2) }],
        };
      },
    );

    this.server.tool(
      "list_supported_languages",
      {},
      async () => ({
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                languages: SUPPORTED_LANGUAGES,
                metrics_by_language: {
                  en: ["flesch_reading_ease", "flesch_kincaid_grade", "gunning_fog", "smog_index", "coleman_liau_index", "automated_readability_index"],
                  tr: ["atesman", "bezirci_yilmaz", "cetinkaya_uzun"],
                  es: ["fernandez_huerta", "szigriszt_pazos"],
                  de: ["flesch_deutsch", "wiener_sachtextformel"],
                  fr: ["kandel_moles"],
                  it: ["gulpease"],
                },
                flow_metrics: ["rhythm", "lexical_diversity", "connective_density"],
                note: "All scores including readability are normalized to 0-100 (higher = easier/more fluent). Each scoring tool returns both raw 'metrics' and 'metrics_100', plus an 'overall_100' average.",
              },
              null,
              2,
            ),
          },
        ],
      }),
    );
  }
}

interface Env {
  MCP_OBJECT: DurableObjectNamespace;
  OPENROUTER_API_KEY?: string;
  UI_USER?: string;
  UI_PASS?: string;
}

/** Read and validate the JSON body for an /api request. */
async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const data = await request.json();
    return data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const json = (data: unknown, status = 200, cached = false) =>
  new Response(JSON.stringify(cached && data && typeof data === "object" ? { ...data, _cached: true } : data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "x-cache": cached ? "HIT" : "MISS",
    },
  });

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Server-side result cache. Identical (tool, text, language, options) inputs
 * return the stored result without recomputation — and, crucially, without
 * re-spending money on the LLM panel. Backed by the Cloudflare Cache API so it
 * survives across requests/isolates. Degrades to direct compute if unavailable.
 */
async function withCache<T>(keyParts: string[], compute: () => Promise<T> | T): Promise<{ data: T; cached: boolean }> {
  const cache = (globalThis as { caches?: CacheStorage }).caches?.default;
  if (!cache) return { data: await compute(), cached: false };

  const hash = await sha256Hex(keyParts.join(" "));
  const key = new Request(`https://readability.cache/v1/${hash}`);
  const hit = await cache.match(key);
  if (hit) return { data: (await hit.json()) as T, cached: true };

  const data = await compute();
  await cache.put(
    key,
    new Response(JSON.stringify(data), {
      headers: { "content-type": "application/json", "cache-control": "max-age=604800" },
    }),
  );
  return { data, cached: false };
}

/** Plain-HTTP handlers for the web UI, mirroring the MCP tools (with caching). */
async function handleApi(tool: string, request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return json({ error: "Use POST." }, 405);
  const body = await readBody(request);
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const language = (typeof body.language === "string" ? body.language : "auto") as
    | (typeof SUPPORTED_LANGUAGES)[number]
    | "auto";
  if (!text) return json({ error: "Field 'text' is required." }, 400);

  const formula = typeof body.formula === "string" ? (body.formula as Formula) : undefined;
  const threshold = typeof body.threshold === "number" ? body.threshold : undefined;
  const weightReadability = typeof body.weight_readability === "number" ? body.weight_readability : undefined;

  try {
    switch (tool) {
      case "score": {
        const { data, cached } = await withCache(["score", language, text], () => scoreText(text, language));
        return json(data, 200, cached);
      }
      case "flow": {
        const { data, cached } = await withCache(["flow", language, text], () => flowScore(text, language));
        return json(data, 200, cached);
      }
      case "seo": {
        const { data, cached } = await withCache(
          ["seo", language, formula ?? "", String(threshold ?? ""), String(weightReadability ?? ""), text],
          () => seoScore(text, { formula, language, threshold, weight_readability: weightReadability }),
        );
        return json(data, 200, cached);
      }
      case "ai": {
        const tier = body.tier === "cheap" || body.tier === "premium" ? (body.tier as PanelTier) : undefined;
        const apiKey = env.OPENROUTER_API_KEY;
        if (tier && !apiKey)
          return json({ error: "LLM tiers require OPENROUTER_API_KEY to be configured." }, 400);
        const llmWeight = typeof body.llm_weight === "number" ? body.llm_weight : undefined;
        const { data, cached } = await withCache(["ai", language, tier ?? "heuristic", String(llmWeight ?? ""), text], () =>
          aiDetectScore(text, {
            language,
            llm: tier && apiKey ? { apiKey, tier, weight: llmWeight } : undefined,
          }),
        );
        return json(data, 200, cached);
      }
      case "all": {
        // One round trip → every free/deterministic score at once.
        const { data, cached } = await withCache(
          ["all", language, formula ?? "", String(threshold ?? ""), String(weightReadability ?? ""), text],
          async () => ({
            language: detectLanguage(text),
            readability: scoreText(text, language),
            flow: flowScore(text, language),
            seo: seoScore(text, { formula, language, threshold, weight_readability: weightReadability }),
            ai: await aiDetectScore(text, { language }),
          }),
        );
        return json(data, 200, cached);
      }
      default:
        return json({ error: "Unknown tool." }, 404);
    }
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/" || url.pathname === "") {
      const accept = request.headers.get("accept") ?? "";
      if (accept.includes("text/html")) {
        return new Response(renderDocsHtml(), {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
      return new Response(
        JSON.stringify(
          {
            name: "readability-mcp",
            description: "Multilingual text readability scoring as an MCP server.",
            endpoints: {
              mcp: "/mcp (Streamable HTTP)",
              sse: "/sse (Server-Sent Events)",
              docs: "/docs (HTML)",
              openapi: "/openapi.json",
            },
            tools: ["score_text", "score_url", "flow_score", "seo_score", "ai_score", "detect_language", "list_supported_languages"],
            languages: SUPPORTED_LANGUAGES,
          },
          null,
          2,
        ),
        { headers: { "content-type": "application/json" } },
      );
    }

    if (url.pathname === "/docs") {
      return new Response(renderDocsHtml(), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    if (url.pathname === "/openapi.json") {
      return new Response(JSON.stringify(renderOpenApi(), null, 2), {
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }

    if (url.pathname === "/sse" || url.pathname.startsWith("/sse/")) {
      return ReadabilityMCP.serveSSE("/sse").fetch(request, env, ctx);
    }

    if (url.pathname === "/mcp") {
      return ReadabilityMCP.serve("/mcp").fetch(request, env, ctx);
    }

    // Web UI + its JSON API, gated behind HTTP Basic Auth (UI_USER / UI_PASS).
    if (url.pathname === "/ui" || url.pathname.startsWith("/api/")) {
      const auth = checkAuth(request, env);
      if (!auth.ok) return auth.response;

      if (url.pathname === "/ui") {
        return new Response(renderUiHtml(), {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
      return handleApi(url.pathname.slice("/api/".length), request, env);
    }

    return new Response("Not found", { status: 404 });
  },
};
