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
  /** JSON Schema for the 200 response, served in the OpenAPI document. */
  output_schema: object;
  cost?: string;
  example_request: object;
  example_response_excerpt: object;
}

const NUM = { type: "number" } as const;
const STR = { type: "string" } as const;

/** A bag of formula name -> value; which keys appear depends on the language. */
const METRIC_MAP = {
  type: "object",
  additionalProperties: NUM,
  description: "Keyed by formula name. Which formulas appear depends on the language.",
} as const;

const READING_STATS = {
  type: "object",
  properties: {
    characters: NUM,
    words: NUM,
    sentences: NUM,
    syllables: NUM,
    avg_word_length: NUM,
    avg_sentence_length: NUM,
    avg_syllables_per_word: NUM,
    long_word_percentage: { ...NUM, description: "Russian only: share of words above three syllables." },
  },
} as const;

const FLOW_METRICS = {
  type: "object",
  properties: { rhythm: NUM, lexical_diversity: NUM, connective_density: NUM },
  required: ["rhythm", "lexical_diversity", "connective_density"],
} as const;

const FLOW_DETAILS = {
  type: "object",
  properties: {
    rhythm: {
      type: "object",
      properties: { coefficient_of_variation: NUM, mean_sentence_length: NUM },
    },
    lexical_diversity: { type: "object", properties: { mattr: NUM, window_size: NUM } },
    connective_density: {
      type: "object",
      properties: { connectives_per_sentence: NUM, total_connectives: NUM },
    },
  },
} as const;

const REASON = {
  type: "object",
  description: "Why a signal fired. Present only when the signal crossed its threshold.",
  properties: {
    code: STR,
    severity: { type: "string", enum: ["low", "medium", "high"] },
    explanation: STR,
    location: {
      type: "object",
      properties: { paragraph: NUM, sentences: { type: "array", items: NUM } },
    },
    evidence: { description: "Signal-specific supporting data." },
  },
  required: ["code", "severity", "explanation"],
} as const;

const SIGNAL_BASE = { score: NUM, reason: REASON } as const;

const LANGUAGE_ENUM = ["en", "tr", "es", "de", "fr", "it", "ru", "ar"];

export const TOOLS: ToolDoc[] = [
  {
    name: "score_text",
    summary: "Multilingual readability scoring of raw text.",
    description:
      "Runs the language's standard readability formulas (Flesch for EN, Ateşman for TR, etc) and returns both raw values and a 0-100 normalized score where higher = easier to read.",
    params: [
      { name: "text", type: "string", required: true, description: "Text to analyze." },
      { name: "language", type: "string", required: false, description: "Language code or 'auto'.", default: "auto", enum: ["auto", "en", "tr", "es", "de", "fr", "it", "ru", "ar"] },
    ],
    output_summary: "{ language, interpretation, metrics, metrics_100, overall_100, stats }",
    output_schema: {
      type: "object",
      properties: {
        language: { type: "string", enum: LANGUAGE_ENUM },
        interpretation: { ...STR, description: "Human-readable band, in the analysed language." },
        metrics: { ...METRIC_MAP, description: "Raw formula values, on each formula's own scale." },
        metrics_100: { ...METRIC_MAP, description: "The same formulas normalized to 0-100, higher = easier." },
        overall_100: { ...NUM, description: "Mean of metrics_100." },
        stats: READING_STATS,
      },
      required: ["language", "interpretation", "metrics", "metrics_100", "overall_100", "stats"],
    },
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
      { name: "language", type: "string", required: false, description: "Language code or 'auto'.", default: "auto", enum: ["auto", "en", "tr", "es", "de", "fr", "it", "ru", "ar"] },
    ],
    output_summary: "{ url, title, text_preview, language, metrics, metrics_100, overall_100, stats }",
    output_schema: {
      type: "object",
      properties: {
        url: { ...STR, description: "Final URL after redirects." },
        title: STR,
        text_preview: { ...STR, description: "First 500 characters of the extracted text." },
        language: { type: "string", enum: LANGUAGE_ENUM },
        interpretation: STR,
        metrics: METRIC_MAP,
        metrics_100: METRIC_MAP,
        overall_100: NUM,
        stats: READING_STATS,
      },
      required: ["url", "language", "metrics_100", "overall_100"],
    },
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
      { name: "language", type: "string", required: false, description: "Language code or 'auto'.", default: "auto", enum: ["auto", "en", "tr", "es", "de", "fr", "it", "ru", "ar"] },
    ],
    output_summary: "{ language, overall_100, metrics_100: { rhythm, lexical_diversity, connective_density }, details, interpretation }",
    output_schema: {
      type: "object",
      properties: {
        language: { type: "string", enum: LANGUAGE_ENUM },
        overall_100: NUM,
        metrics_100: FLOW_METRICS,
        details: FLOW_DETAILS,
        interpretation: { ...STR, description: "Band label, in the analysed language." },
      },
      required: ["language", "overall_100", "metrics_100", "details", "interpretation"],
    },
    example_request: { text: "Cümle bir. Cümle iki. Cümle üç." },
    example_response_excerpt: { overall_100: 32.1, metrics_100: { rhythm: 0, lexical_diversity: 60, connective_density: 36 }, interpretation: "Düşük akış" },
  },
  {
    name: "seo_score",
    summary: "Single-formula readability + flow combined for SEO publishing decisions.",
    description:
      "Picks one readability formula (default per language) and combines it with `flow_score` using configurable weights. Returns a `passed` boolean against a threshold and concrete localized suggestions (EN/TR/RU bundles fully populated; ES/DE/FR/IT have basic bundles).",
    params: [
      { name: "text", type: "string", required: true, description: "Text to analyze." },
      { name: "formula", type: "string", required: false, description: "Override readability formula. Defaults: Flesch (EN), Ateşman (TR), Fernández-Huerta (ES), Flesch-Deutsch (DE), Kandel-Moles (FR), Gulpease (IT), Oborneva (RU), AWL-ASL index (AR). A formula the language does not provide is rejected with the list of the ones it does." },
      { name: "language", type: "string", required: false, description: "Language code or 'auto'.", default: "auto" },
      { name: "threshold", type: "number", required: false, description: "Pass threshold on the 0-100 scale.", default: "70" },
      { name: "weight_readability", type: "number", required: false, description: "Weight of readability vs flow in overall score (0-1).", default: "0.5" },
    ],
    output_summary: "{ language, formula, threshold, weights, readability_100, readability_raw, flow_100, overall_100, passed, verdict, suggestions, breakdown }",
    output_schema: {
      type: "object",
      properties: {
        language: { type: "string", enum: LANGUAGE_ENUM },
        formula: { ...STR, description: "The formula actually used." },
        threshold: NUM,
        weights: { type: "object", properties: { readability: NUM, flow: NUM } },
        readability_100: NUM,
        readability_raw: { ...NUM, description: "The chosen formula on its own scale." },
        flow_100: NUM,
        overall_100: { ...NUM, description: "readability_100 and flow_100 blended by `weights`." },
        passed: { type: "boolean", description: "Both readability_100 and flow_100 met the threshold." },
        verdict: { ...STR, description: "Localized one-line verdict." },
        suggestions: { type: "array", items: STR, description: "Localized fixes for whichever side failed." },
        breakdown: {
          type: "object",
          properties: { flow_metrics: FLOW_METRICS, flow_details: FLOW_DETAILS },
        },
      },
      required: ["language", "formula", "overall_100", "passed", "verdict"],
    },
    example_request: { text: "Buraya analiz edilecek bir Türkçe metin gelir...", threshold: 70 },
    example_response_excerpt: { formula: "atesman", overall_100: 65.3, passed: false, verdict: "Akış zayıf: cümle uzunluklarını çeşitlendir", suggestions: ["Kısa ve uzun cümleleri sırala — monoton ritimden kaçın"] },
  },
  {
    name: "ai_score",
    summary: "AI-likeness score with explainable reasons + optional LLM judge panel.",
    description:
      "Six heuristic signals always run inside the Worker (free, ms-fast): burstiness, AI-tell phrases (EN/TR/RU/AR lexicons), fragment-list paragraphs, parallel structure runs, em-dash overuse, and \"not X but Y\" patterns including multi-item runs. Each signal returns a `reason` with severity, explanation, evidence and location. Several signals are language-aware: the dash is scored leniently for Russian because it is a grammatical copula there, the Russian fragment check accepts verbless predicates, and Turkish case folding is locale-aware. The optional LLM panel adds 3 frontier models in parallel via OpenRouter, judging in EN, TR, RU or AR with a prompt written for that language, surfacing consensus reasons (codes flagged by ≥2 judges) with quoted evidence. Composite blends heuristic and LLM scores; verdict escalates by max signal severity so a single high-severity finding isn't drowned out.",
    cost:
      "tier=heuristic → $0 / ~5ms · tier=cheap → ~$0.012 / ~10s · tier=premium → ~$0.066 / ~25s. LLM tiers require OPENROUTER_API_KEY secret. Output includes total_cost_usd per panel call.",
    params: [
      { name: "text", type: "string", required: true, description: "Text to score." },
      { name: "language", type: "string", required: false, description: "Language code or 'auto'.", default: "auto", enum: ["auto", "en", "tr", "es", "de", "fr", "it", "ru", "ar"] },
      { name: "tier", type: "string", required: false, description: "Scoring tier.", default: "heuristic", enum: ["heuristic", "cheap", "premium"] },
      { name: "models", type: "string[]", required: false, description: "Override the panel with custom OpenRouter model IDs. Implies LLM use; ignores `tier` if non-empty." },
      { name: "llm_weight", type: "number", required: false, description: "Weight of LLM panel score vs heuristic in composite_score (0-1).", default: "0.6" },
    ],
    output_summary: "{ language, composite_score, verdict, heuristic_score, llm_score?, signals: { burstiness, ai_phrases, fragment_lists, parallel_structure, em_dash, not_x_but_y, llm_panel? }, reasons[], per_sentence[], summary_advice[], stats }",
    output_schema: {
      type: "object",
      properties: {
        language: { type: "string", enum: LANGUAGE_ENUM },
        composite_score: { ...NUM, description: "0-100, higher = more AI-like. Equals heuristic_score when no panel ran." },
        verdict: { type: "string", enum: ["likely_human", "uncertain", "likely_ai", "very_likely_ai"] },
        heuristic_score: { ...NUM, description: "Weighted blend of the six in-Worker signals." },
        llm_score: { ...NUM, description: "Mean panel score. Absent unless an LLM tier ran." },
        signals: {
          type: "object",
          properties: {
            burstiness: {
              type: "object",
              description: "Sentence-length variance. Fires when the rhythm is too uniform.",
              properties: { ...SIGNAL_BASE, cv: NUM, mean_sentence_length: NUM },
            },
            ai_phrases: {
              type: "object",
              description: "Stock-phrase lexicon hits. Overlapping entries are counted once, longest first.",
              properties: {
                ...SIGNAL_BASE,
                total: NUM,
                hits: {
                  type: "array",
                  items: { type: "object", properties: { phrase: STR, count: NUM } },
                },
              },
            },
            fragment_lists: {
              type: "object",
              description: "Runs of three or more consecutive verbless fragments inside one paragraph.",
              properties: {
                ...SIGNAL_BASE,
                occurrences: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: { paragraph: NUM, consecutive_count: NUM, example: STR },
                  },
                },
              },
            },
            parallel_structure: {
              type: "object",
              description: "Consecutive sentences sharing an opening token and length.",
              properties: {
                ...SIGNAL_BASE,
                runs: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: { start_sentence: NUM, length: NUM, pattern: STR },
                  },
                },
              },
            },
            em_dash: {
              type: "object",
              description:
                "Dash density. Scored leniently for Russian, where the dash is a grammatical copula, and an en dash between digits is read as a numeric range rather than a dash.",
              properties: { ...SIGNAL_BASE, count: NUM, density_per_sentence: NUM },
            },
            not_x_but_y: {
              type: "object",
              description: "Rhetorical antithesis. Gated on density, so long human texts do not accumulate a reason.",
              properties: {
                ...SIGNAL_BASE,
                count: NUM,
                multi_item_runs: {
                  ...NUM,
                  description: "Matches negating several items in a row (\"not A, not B, not C - but D\"), which weigh more than a two-part antithesis.",
                },
              },
            },
            llm_panel: {
              type: "object",
              description: "Present only when an LLM tier ran.",
              properties: {
                score: NUM,
                agreement: { type: "string", enum: ["high", "medium", "low"] },
                total_cost_usd: NUM,
                judges: { type: "array", items: { type: "object" } },
                consensus_reasons: { type: "array", items: { type: "object" } },
              },
            },
          },
        },
        reasons: { type: "array", items: REASON },
        per_sentence: {
          type: "array",
          items: {
            type: "object",
            properties: {
              idx: NUM,
              text: STR,
              word_count: NUM,
              flags: { type: "array", items: STR },
            },
          },
        },
        summary_advice: { type: "array", items: STR, description: "Localized fixes, one per raised reason." },
        stats: {
          type: "object",
          properties: { sentences: NUM, paragraphs: NUM, words: NUM },
        },
      },
      required: ["language", "composite_score", "verdict", "heuristic_score", "signals", "reasons", "stats"],
    },
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
    name: "grammar_check",
    summary: "Turkish orthography check with located findings.",
    description:
      "Rule-based spelling checks for Turkish, free and in-Worker. Every rule was measured against the 42,449 attested example sentences in the TDK dictionary — text correct by definition, so any hit there is a false positive — and only rules under 0.5% were kept: apostrophe consistency (0.08%), suffix vowel harmony (0.41%) and the conjunction 'ki' written joined (0.02%). Two rules were measured and deliberately excluded: the question particle (0.66%) and the famous da/de conjunction (6.43%), which morphology cannot separate from the locative suffix — 'okulda' and 'okul da' are both correct and only meaning distinguishes them. The lexicon behind the last two rules is generated from a local dictionary and is not redistributed; when it is absent the response says so in `skipped_rules` rather than silently passing.",
    params: [
      { name: "text", type: "string", required: true, description: "Text to check." },
      { name: "language", type: "string", required: false, description: "Only Turkish is supported.", default: "tr", enum: ["tr"] },
    ],
    output_summary: "{ language, findings[], findings_per_sentence, score_100, lexicon_available, checked_rules, skipped_rules, stats }",
    output_schema: {
      type: "object",
      properties: {
        language: { type: "string", enum: ["tr"] },
        findings: {
          type: "array",
          items: {
            type: "object",
            properties: {
              rule: { ...STR, description: "kesme_isareti_tutarsiz | ek_uyumu | baglac_ki_bitisik" },
              severity: { type: "string", enum: ["low", "medium", "high"] },
              message: { ...STR, description: "Localized explanation." },
              sentence: { ...NUM, description: "Sentence index, or -1 for a document-level finding." },
              excerpt: STR,
              suggestion: { ...STR, description: "The corrected form, when one can be derived." },
            },
            required: ["rule", "severity", "message", "sentence"],
          },
        },
        findings_per_sentence: NUM,
        score_100: { ...NUM, description: "100 with no findings, falling as they accumulate." },
        lexicon_available: { type: "boolean", description: "False when the generated Turkish lexicon is absent." },
        checked_rules: { type: "array", items: STR },
        skipped_rules: { type: "array", items: STR, description: "Rules that need the lexicon and could not run." },
        stats: { type: "object", properties: { sentences: NUM, words: NUM } },
      },
      required: ["language", "findings", "score_100", "lexicon_available", "checked_rules", "skipped_rules", "stats"],
    },
    example_request: { text: "Kız Kulesi'ni gördük. Hero’ya ulaştı." },
    example_response_excerpt: {
      language: "tr",
      score_100: 92.73,
      findings: [{ rule: "kesme_isareti_tutarsiz", severity: "low", message: "Kesme işareti tutarsız: 2 düz (') ve 2 kıvrık (’) kullanılmış." }],
    },
  },
  {
    name: "style_profile",
    summary: "Where a Turkish text sits between registers, per dimension.",
    description:
      "A profile, not a score. Style has no universal optimum — a statute is supposed to be nominal and impersonal and marketing copy is not — so the output is where the text sits relative to four registers (edebiyat, haber, pazarlama, ansiklopedi) on each dimension, plus the nearest register overall. Pass `target` to get the signed deviation from that register's norms. Dimensions were kept only if they were measured to separate registers on a four-register Turkish corpus; five candidates were dropped for barely moving (nominalisation 1.4x, light verbs 1.2x, participle load 1.2x, connective variety 1.6x, passive voice 1.9x). The three modes of address are the strongest at 12.7x, 16.1x and 4.9x.",
    params: [
      { name: "text", type: "string", required: true, description: "Text to profile." },
      { name: "language", type: "string", required: false, description: "Only Turkish is supported.", default: "tr", enum: ["tr"] },
      { name: "target", type: "string", required: false, description: "Register to measure deviation against.", enum: ["edebiyat", "haber", "pazarlama", "ansiklopedi"] },
    ],
    output_summary: "{ language, target?, closest_register, dimensions, notes, stats }",
    output_schema: {
      type: "object",
      properties: {
        language: { type: "string", enum: ["tr"] },
        target: { type: "string", enum: ["edebiyat", "haber", "pazarlama", "ansiklopedi"] },
        closest_register: { type: "string", enum: ["edebiyat", "haber", "pazarlama", "ansiklopedi"] },
        dimensions: {
          type: "object",
          description: "Keyed by dimension name.",
          additionalProperties: {
            type: "object",
            properties: {
              value: NUM,
              norms: { type: "object", additionalProperties: NUM, description: "Corpus mean per register." },
              closest: { type: "string", enum: ["edebiyat", "haber", "pazarlama", "ansiklopedi"] },
              deviation: { ...NUM, description: "Signed distance from the target register. Present only when `target` was given." },
            },
            required: ["value", "norms", "closest"],
          },
        },
        notes: { type: "array", items: STR, description: "Caveats, such as the text being too short to profile reliably." },
        stats: { type: "object", properties: { sentences: NUM, words: NUM } },
      },
      required: ["language", "closest_register", "dimensions", "notes", "stats"],
    },
    example_request: { text: "Kuleyi sahil yolundan görebilirsiniz.", target: "pazarlama" },
    example_response_excerpt: {
      closest_register: "edebiyat",
      dimensions: { ikinci_kisi_hitabi: { value: 28.85, closest: "pazarlama", deviation: 22.54 } },
    },
  },
  {
    name: "detect_language",
    summary: "Detect the language of a given text.",
    description: "Script check for Arabic and Cyrillic, then a stopword-frequency + diacritic heuristic across the Latin-script languages. Fast, deterministic, no external calls.",
    params: [{ name: "text", type: "string", required: true, description: "Text to detect language of." }],
    output_summary: "{ language: 'en' | 'tr' | 'es' | 'de' | 'fr' | 'it' | 'ru' | 'ar' }",
    output_schema: {
      type: "object",
      properties: { language: { type: "string", enum: LANGUAGE_ENUM } },
      required: ["language"],
    },
    example_request: { text: "Bu bir Türkçe cümledir." },
    example_response_excerpt: { language: "tr" },
  },
  {
    name: "list_supported_languages",
    summary: "Meta tool: enumerate languages, readability formulas per language, and flow metrics.",
    description: "Useful for client UIs to populate language pickers and explain available scoring options. Note that readability formulas are language-specific: a formula listed for one language is rejected for another.",
    params: [],
    output_summary: "{ languages, metrics_by_language, flow_metrics, note }",
    output_schema: {
      type: "object",
      properties: {
        languages: { type: "array", items: { type: "string", enum: LANGUAGE_ENUM } },
        metrics_by_language: {
          type: "object",
          additionalProperties: { type: "array", items: STR },
        },
        flow_metrics: { type: "array", items: STR },
        note: STR,
      },
      required: ["languages", "metrics_by_language", "flow_metrics"],
    },
    example_request: {},
    example_response_excerpt: { languages: ["en", "tr", "es", "de", "fr", "it", "ru", "ar"], flow_metrics: ["rhythm", "lexical_diversity", "connective_density"] },
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
      <details>
        <summary>Full response schema</summary>
        <pre><code>${escapeHtml(JSON.stringify(t.output_schema, null, 2))}</code></pre>
      </details>
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
                  "application/json": {
                    schema: t.output_schema,
                    example: t.example_response_excerpt,
                  },
                },
              },
            },
          },
        },
      ]),
    ),
  };
}
