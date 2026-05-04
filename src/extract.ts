const SKIP_TAGS = new Set([
  "script",
  "style",
  "noscript",
  "iframe",
  "svg",
  "nav",
  "header",
  "footer",
  "aside",
  "form",
  "button",
  "menu",
]);

const TEXT_TAGS = new Set([
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "blockquote",
  "pre",
  "td",
  "article",
  "section",
  "main",
  "div",
]);

class TextCollector {
  parts: string[] = [];
  buffer = "";
  skipDepth = 0;
  title = "";
  inTitle = false;

  flush(): void {
    const t = this.buffer.replace(/\s+/g, " ").trim();
    if (t.length > 0) {
      this.parts.push(t);
    }
    this.buffer = "";
  }
}

export interface ExtractedPage {
  title: string;
  text: string;
  url: string;
  contentType: string;
  status: number;
}

export async function extractFromUrl(url: string): Promise<ExtractedPage> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; readability-mcp/0.1; +https://github.com/aliarifsoydas/readability-mcp)",
      Accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
  });

  const contentType = res.headers.get("content-type") ?? "";
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
  }
  if (!/html|xml/i.test(contentType)) {
    const text = await res.text();
    return { title: "", text: text.trim(), url: res.url, contentType, status: res.status };
  }

  const collector = new TextCollector();

  const rewriter = new HTMLRewriter()
    .on("title", {
      element() {
        collector.inTitle = true;
      },
      text(t) {
        if (collector.inTitle) collector.title += t.text;
        if (t.lastInTextNode) collector.inTitle = false;
      },
    })
    .on("*", {
      element(el) {
        const tag = el.tagName.toLowerCase();
        if (SKIP_TAGS.has(tag)) {
          collector.skipDepth++;
          el.onEndTag(() => {
            collector.skipDepth = Math.max(0, collector.skipDepth - 1);
          });
          return;
        }
        if (TEXT_TAGS.has(tag)) {
          collector.flush();
          el.onEndTag(() => collector.flush());
        }
      },
      text(t) {
        if (collector.skipDepth > 0) return;
        collector.buffer += t.text;
      },
    });

  const transformed = rewriter.transform(res);
  await transformed.arrayBuffer();
  collector.flush();

  const text = collector.parts.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
  return {
    title: collector.title.trim(),
    text,
    url: res.url,
    contentType,
    status: res.status,
  };
}
