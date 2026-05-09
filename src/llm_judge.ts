import type { SupportedLanguage } from "./text.js";

export interface LlmJudgeReason {
  code: string;
  severity: "low" | "medium" | "high";
  explanation: string;
  quoted_evidence?: string[];
  paragraph_index?: number;
}

export interface LlmJudgeResult {
  score: number;
  verdict: "likely_human" | "uncertain" | "likely_ai" | "very_likely_ai";
  confidence: number;
  reasons: LlmJudgeReason[];
  per_paragraph: { idx: number; score: number; note?: string }[];
  key_recommendations: string[];
  model: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  cost_usd?: number;
  ms?: number;
  raw?: unknown;
  error?: string;
}

const SYSTEM_TR = `Sen bir AI içerik tespit uzmanısın. Verilen metnin AI tarafından üretilmiş olma olasılığını değerlendiriyorsun.

DEĞERLENDİRME BOYUTLARI:
- vocabulary_register: kelime tercihi tutarlılığı, LLM'in tercih ettiği yüksek-frekans kelimeler
- sentence_cadence: cümle uzunluğu varyansı, ritim tekdüzeliği
- factual_specificity: somut detay yoğunluğu (gerçek isimler, tarihler, sayılar) vs. genel-geçer ifadeler
- ai_signature_phrasing: bilinen LLM kalıpları, retorik figürler
- domain_authenticity: alan-spesifik nüans var mı, jenerik mi
- structural_markers: aşırı paralelizm, fragman listeleri, "X değil Y" yoğunluğu
- style_consistency: insan yazımındaki doğal kırılmalar var mı

KURALLAR:
- Yalnızca metinden ALINTILANAN kanıtlara dayan; uydurma
- Skor 0-100: 0 = kesinlikle insan, 100 = kesinlikle AI
- Her reason için "quoted_evidence" alanına metnin kendisinden TIRNAKLA gerçek alıntı koy
- Maksimum 5 reason, en güçlü olanlar
- per_paragraph: her paragraf için ayrı skor, "note" sadece dikkat çekici ise

ÇIKTI: GEÇERLİ JSON, ek metin YOK.`;

const SYSTEM_EN = `You are an AI content detection expert. Evaluate the likelihood that the given text was AI-generated.

EVALUATION DIMENSIONS:
- vocabulary_register: word choice consistency, high-frequency LLM-favored vocabulary
- sentence_cadence: sentence-length variance, rhythm monotony
- factual_specificity: density of concrete details (real names, dates, numbers) vs generic statements
- ai_signature_phrasing: known LLM phrasal patterns, rhetorical figures
- domain_authenticity: domain-specific nuance vs generic content
- structural_markers: excessive parallelism, fragment lists, "not X but Y" overuse
- style_consistency: natural breaks/inconsistencies as humans produce

RULES:
- Base every reason ONLY on quoted evidence from the text; do not fabricate
- Score 0-100: 0 = certainly human, 100 = certainly AI
- Each reason must include "quoted_evidence" with actual quoted strings from the text
- At most 5 reasons, strongest first
- per_paragraph: per-paragraph score, "note" only if remarkable

OUTPUT: VALID JSON ONLY, no extra prose.`;

const SCHEMA_HINT = `{
  "score": 0-100,
  "verdict": "likely_human" | "uncertain" | "likely_ai" | "very_likely_ai",
  "confidence": 0.0-1.0,
  "reasons": [
    {
      "code": "vocabulary_register" | "sentence_cadence" | "factual_specificity" | "ai_signature_phrasing" | "domain_authenticity" | "structural_markers" | "style_consistency",
      "severity": "low" | "medium" | "high",
      "explanation": "<why, in user's language>",
      "quoted_evidence": ["<exact quote 1>", "<exact quote 2>"],
      "paragraph_index": 0
    }
  ],
  "per_paragraph": [{ "idx": 0, "score": 0-100, "note": "<optional>" }],
  "key_recommendations": ["<actionable rewrite hint>"]
}`;

function buildUserPrompt(text: string, lang: SupportedLanguage): string {
  const langTag = lang === "tr" ? "Türkçe" : lang.toUpperCase();
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p.length > 0);
  const numbered = paragraphs.map((p, i) => `[P${i}] ${p}`).join("\n\n");
  return `Dil: ${langTag}\n\nSCHEMA:\n${SCHEMA_HINT}\n\nMETİN:\n${numbered}`;
}

function safeJsonParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    const m = s.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

function deriveVerdict(score: number): LlmJudgeResult["verdict"] {
  if (score < 25) return "likely_human";
  if (score < 50) return "uncertain";
  if (score < 75) return "likely_ai";
  return "very_likely_ai";
}

export interface LlmJudgeOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
}

const DEFAULT_MODEL = "anthropic/claude-haiku-4.5";
const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

export async function llmJudge(
  text: string,
  language: SupportedLanguage,
  opts: LlmJudgeOptions,
): Promise<LlmJudgeResult> {
  const model = opts.model ?? DEFAULT_MODEL;
  const baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
  const timeoutMs = opts.timeoutMs ?? 30_000;

  const system = language === "tr" ? SYSTEM_TR : SYSTEM_EN;
  const user = buildUserPrompt(text, language);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const t0 = Date.now();

  try {
    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/aliarifsoydas/readability-mcp",
        "X-Title": "readability-mcp ai_score",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.0,
        max_tokens: 3500,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });

    if (!resp.ok) {
      const body = await resp.text();
      return errorResult(model, `OpenRouter ${resp.status}: ${body.slice(0, 300)}`);
    }

    const data = (await resp.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
    };
    const content = data.choices?.[0]?.message?.content ?? "";
    const usage = data.usage ?? {};
    const ms = Date.now() - t0;
    const parsed = safeJsonParse(content);
    if (!parsed || typeof parsed !== "object") {
      return errorResult(model, `Unparseable JSON from model: ${content.slice(0, 200)}`);
    }

    const p = parsed as Record<string, unknown>;
    const rawScore = typeof p.score === "number" ? p.score : Number(p.score);
    const score = Number.isFinite(rawScore) ? Math.max(0, Math.min(100, rawScore)) : 50;
    const confidence = typeof p.confidence === "number" ? Math.max(0, Math.min(1, p.confidence)) : 0.5;

    const reasonsRaw = Array.isArray(p.reasons) ? p.reasons : [];
    const reasons: LlmJudgeReason[] = reasonsRaw.slice(0, 8).map((r) => {
      const obj = r as Record<string, unknown>;
      const sevRaw = typeof obj.severity === "string" ? obj.severity : "medium";
      const severity: LlmJudgeReason["severity"] =
        sevRaw === "low" || sevRaw === "high" ? sevRaw : "medium";
      const quoted = Array.isArray(obj.quoted_evidence)
        ? (obj.quoted_evidence.filter((q) => typeof q === "string") as string[])
        : undefined;
      return {
        code: typeof obj.code === "string" ? obj.code : "unspecified",
        severity,
        explanation: typeof obj.explanation === "string" ? obj.explanation : "",
        quoted_evidence: quoted,
        paragraph_index: typeof obj.paragraph_index === "number" ? obj.paragraph_index : undefined,
      };
    });

    const perRaw = Array.isArray(p.per_paragraph) ? p.per_paragraph : [];
    const per_paragraph = perRaw
      .map((row) => {
        const o = row as Record<string, unknown>;
        const idx = typeof o.idx === "number" ? o.idx : -1;
        const s = typeof o.score === "number" ? o.score : Number(o.score);
        return {
          idx,
          score: Number.isFinite(s) ? Math.max(0, Math.min(100, s)) : 0,
          note: typeof o.note === "string" ? o.note : undefined,
        };
      })
      .filter((row) => row.idx >= 0);

    const recsRaw = Array.isArray(p.key_recommendations) ? p.key_recommendations : [];
    const key_recommendations = (recsRaw.filter((s) => typeof s === "string") as string[]).slice(0, 8);

    return {
      score: Math.round(score * 100) / 100,
      verdict: deriveVerdict(score),
      confidence: Math.round(confidence * 1000) / 1000,
      reasons,
      per_paragraph,
      key_recommendations,
      model,
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      cost_usd: usage.cost,
      ms,
    };
  } catch (e) {
    return errorResult(model, e instanceof Error ? e.message : String(e));
  } finally {
    clearTimeout(timer);
  }
}

function errorResult(model: string, error: string): LlmJudgeResult {
  return {
    score: 0,
    verdict: "likely_human",
    confidence: 0,
    reasons: [],
    per_paragraph: [],
    key_recommendations: [],
    model,
    error,
  };
}
