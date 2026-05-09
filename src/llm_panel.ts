import type { SupportedLanguage } from "./text.js";
import { llmJudge, type LlmJudgeResult } from "./llm_judge.js";

export const DEFAULT_PANEL_MODELS = [
  "anthropic/claude-sonnet-4.6",
  "openai/gpt-5.4",
  "google/gemini-3.1-pro-preview",
];

export interface PanelOptions {
  apiKey: string;
  baseUrl?: string;
  models?: string[];
  timeoutMs?: number;
}

export interface ConsensusReason {
  code: string;
  judges: string[];
  severity_distribution: { low: number; medium: number; high: number };
  representative_explanation: string;
  quoted_evidence: string[];
}

export interface PanelResult {
  models_used: string[];
  models_failed: { model: string; error: string }[];
  composite_score: number;
  per_judge_scores: { model: string; score: number; verdict: string }[];
  variance: number;
  agreement: "high" | "medium" | "low";
  consensus_reasons: ConsensusReason[];
  unique_reasons_per_judge: { model: string; reasons: LlmJudgeResult["reasons"] }[];
  combined_recommendations: string[];
  raw_judges: { model: string; result: LlmJudgeResult }[];
}

function variance(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length;
}

function stddev(xs: number[]): number {
  return Math.sqrt(variance(xs));
}

function classifyAgreement(sd: number): PanelResult["agreement"] {
  if (sd < 10) return "high";
  if (sd < 20) return "medium";
  return "low";
}

function buildConsensus(judges: { model: string; result: LlmJudgeResult }[]): ConsensusReason[] {
  const byCode = new Map<string, { judges: string[]; reasons: LlmJudgeResult["reasons"] }>();
  for (const j of judges) {
    if (j.result.error) continue;
    for (const r of j.result.reasons) {
      const key = r.code;
      const entry = byCode.get(key) ?? { judges: [], reasons: [] };
      if (!entry.judges.includes(j.model)) entry.judges.push(j.model);
      entry.reasons.push(r);
      byCode.set(key, entry);
    }
  }
  const out: ConsensusReason[] = [];
  for (const [code, entry] of byCode) {
    if (entry.judges.length < 2) continue;
    const dist = { low: 0, medium: 0, high: 0 };
    const quotes: string[] = [];
    let representative = "";
    let bestSeverityRank = -1;
    for (const r of entry.reasons) {
      dist[r.severity]++;
      if (r.quoted_evidence) {
        for (const q of r.quoted_evidence) {
          if (!quotes.includes(q)) quotes.push(q);
        }
      }
      const rank = r.severity === "high" ? 2 : r.severity === "medium" ? 1 : 0;
      if (rank > bestSeverityRank && r.explanation) {
        representative = r.explanation;
        bestSeverityRank = rank;
      }
    }
    out.push({
      code,
      judges: entry.judges,
      severity_distribution: dist,
      representative_explanation: representative,
      quoted_evidence: quotes.slice(0, 6),
    });
  }
  out.sort((a, b) => b.judges.length - a.judges.length);
  return out;
}

export async function llmPanel(
  text: string,
  language: SupportedLanguage,
  opts: PanelOptions,
): Promise<PanelResult> {
  const models = opts.models && opts.models.length > 0 ? opts.models : DEFAULT_PANEL_MODELS;

  const settled = await Promise.all(
    models.map((model) =>
      llmJudge(text, language, {
        apiKey: opts.apiKey,
        baseUrl: opts.baseUrl,
        model,
        timeoutMs: opts.timeoutMs,
      }).then((result) => ({ model, result })),
    ),
  );

  const ok = settled.filter((s) => !s.result.error);
  const failed = settled
    .filter((s) => s.result.error)
    .map((s) => ({ model: s.model, error: s.result.error ?? "unknown" }));

  const scores = ok.map((s) => s.result.score);
  const composite = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const sd = stddev(scores);

  const consensus = buildConsensus(ok);
  const consensusCodes = new Set(consensus.map((c) => c.code));

  const unique_reasons_per_judge = ok.map((s) => ({
    model: s.model,
    reasons: s.result.reasons.filter((r) => !consensusCodes.has(r.code)),
  }));

  const recSet = new Set<string>();
  for (const j of ok) for (const r of j.result.key_recommendations) recSet.add(r);
  const combined_recommendations = Array.from(recSet).slice(0, 10);

  return {
    models_used: ok.map((s) => s.model),
    models_failed: failed,
    composite_score: Math.round(composite * 100) / 100,
    per_judge_scores: ok.map((s) => ({ model: s.model, score: s.result.score, verdict: s.result.verdict })),
    variance: Math.round(variance(scores) * 100) / 100,
    agreement: classifyAgreement(sd),
    consensus_reasons: consensus,
    unique_reasons_per_judge,
    combined_recommendations,
    raw_judges: settled,
  };
}
