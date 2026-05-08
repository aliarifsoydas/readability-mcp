import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { scoreText, SUPPORTED_LANGUAGES, detectLanguage } from "./scorers/index.js";
import { extractFromUrl } from "./extract.js";

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
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/" || url.pathname === "") {
      return new Response(
        JSON.stringify(
          {
            name: "readability-mcp",
            description: "Multilingual text readability scoring as an MCP server.",
            endpoints: {
              mcp: "/mcp (Streamable HTTP)",
              sse: "/sse (Server-Sent Events)",
            },
            tools: ["score_text", "score_url", "detect_language", "list_supported_languages"],
            languages: SUPPORTED_LANGUAGES,
          },
          null,
          2,
        ),
        { headers: { "content-type": "application/json" } },
      );
    }

    if (url.pathname === "/sse" || url.pathname.startsWith("/sse/")) {
      return ReadabilityMCP.serveSSE("/sse").fetch(request, env, ctx);
    }

    if (url.pathname === "/mcp") {
      return ReadabilityMCP.serve("/mcp").fetch(request, env, ctx);
    }

    return new Response("Not found", { status: 404 });
  },
};
