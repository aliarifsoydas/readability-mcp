import { splitSentences, splitWords, type SupportedLanguage } from "./text.js";
import { detectLanguage } from "./scorers/index.js";
import { llmPanel, modelsForTier, type PanelResult, type PanelTier } from "./llm_panel.js";

const AI_PHRASES: Record<SupportedLanguage, string[]> = {
  en: [
    "delve into", "delves into", "delving into",
    "tapestry", "rich tapestry",
    "navigate the landscape", "navigating the landscape", "navigate the complexities",
    "in conclusion", "in summary", "to summarize", "in essence",
    "it's worth noting", "it is worth noting", "it should be noted",
    "it's important to note", "it is important to note",
    "in the realm of", "in the world of", "at the heart of",
    "stand as a testament", "stands as a testament",
    "embark on", "embark on a journey", "embarking on",
    "uncharted territory", "uncharted waters",
    "ever-evolving", "ever-changing", "in today's fast-paced",
    "in today's digital age", "in the digital age",
    "harness the power", "leverage the power", "unleash the potential", "unlock the potential",
    "play a pivotal role", "plays a pivotal role", "pivotal role",
    "the intricacies of", "intricate details", "multifaceted",
    "seamlessly integrate", "seamless integration",
    "holistic approach", "comprehensive understanding",
    "foster a sense", "foster an environment",
    "the importance of", "cannot be overstated",
    "a testament to", "a beacon of", "shed light on",
    "in this article, we will", "in this guide, we will",
    "by the end of this", "let's dive into", "let us delve",
  ],
  tr: [
    "günümüzde", "günümüz dünyasında", "günümüz teknoloji çağında", "günümüz koşullarında",
    "şüphesiz", "kuşkusuz", "hiç şüphesiz", "hiç kuşkusuz",
    "belirtmek gerekir ki", "belirtmek gerekir", "ifade etmek gerekir",
    "bu bağlamda", "bu çerçevede", "bu kapsamda", "bu doğrultuda",
    "söz konusu olduğunda",
    "önemli bir rol oynamaktadır", "kritik bir rol oynar", "kritik bir rol oynamaktadır",
    "hayati bir öneme sahiptir", "büyük önem taşımaktadır", "büyük önem arz etmektedir",
    "göz ardı edilemez", "göz ardı edilmemelidir",
    "ele alınması gereken", "ele almak gerekirse",
    "dikkat çekici bir şekilde", "dikkate değer", "kayda değer",
    "hızla değişen", "hızla gelişen", "sürekli evrilen", "sürekli değişen",
    "bütünsel bir yaklaşım", "kapsamlı bir bakış",
    "çok yönlü", "çok katmanlı", "çok boyutlu",
    "ön plana çıkmaktadır", "öne çıkmaktadır", "bir adım öne çıkar",
    "değerlendirildiğinde", "incelendiğinde", "ele alındığında",
    "sonuç olarak", "özetle", "netice itibarıyla", "kısacası",
    "vurgulamak gerekir", "altını çizmek gerekir",
    "bu makalede", "bu yazıda", "bu rehberde",
    "atılan adımlar", "atılması gereken adımlar",
    "etkin bir şekilde", "verimli bir şekilde",
  ],
  es: [],
  de: [],
  fr: [],
  it: [],
};

const FRAGMENT_STARTERS: Record<SupportedLanguage, RegExp> = {
  en: /^(the|a|an|our|your|their|this|that|those|these|every|each|all|some|any|no)\b/i,
  tr: /^(bu|şu|o|her|tüm|tümü|bir|bazı|hiç|kimi|en)\b/i,
  es: /^(el|la|los|las|un|una|unos|unas|este|esta|esos|esas)\b/i,
  de: /^(der|die|das|den|dem|ein|eine|einen|jeder|alle)\b/i,
  fr: /^(le|la|les|un|une|des|ce|cette|ces|chaque|tous)\b/i,
  it: /^(il|la|lo|gli|le|un|una|uno|questo|questa|ogni|tutti)\b/i,
};

const SENTENCE_VERB_HINT: Record<SupportedLanguage, RegExp> = {
  en: /\b(is|are|was|were|be|been|being|am|has|have|had|do|does|did|will|would|can|could|should|may|might|must|shall|let|gets|got|goes|went|comes|came|sees|saw|knows|knew|thinks|thought|says|said|tells|told|makes|made|takes|took)\b/i,
  tr: /\b\w+(yor(?:um|sun|uz|sunuz|lar)?|miş(?:tir|ler)?|mış(?:tır|lar)?|muş(?:tur|lar)?|müş(?:tür|ler)?|acak(?:tır|lar)?|ecek(?:tir|ler)?|dır|dir|dur|dür|tır|tir|tur|tür)\b/i,
  es: /\b(es|son|era|fue|fueron|ha|han|había|hay|está|están|tiene|tienen)\b/i,
  de: /\b(ist|sind|war|waren|hat|haben|hatte|wird|werden|wurde|kann|muss|soll|darf)\b/i,
  fr: /\b(est|sont|était|étaient|a|ont|avait|sera|seront|peut|doit|peuvent|doivent)\b/i,
  it: /\b(è|sono|era|erano|ha|hanno|aveva|sarà|saranno|può|deve|possono|devono)\b/i,
};

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

function isFragment(sentence: string, lang: SupportedLanguage): boolean {
  const words = splitWords(sentence);
  if (words.length < 2 || words.length > 8) return false;
  const startsWithDeterminer = FRAGMENT_STARTERS[lang].test(sentence.trim());
  const hasVerb = SENTENCE_VERB_HINT[lang].test(sentence);
  return startsWithDeterminer && !hasVerb;
}

function mean(xs: number[]): number {
  if (!xs.length) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) ** 2;
  return Math.sqrt(s / xs.length);
}

interface Reason {
  code: string;
  severity: "low" | "medium" | "high";
  explanation: string;
  location?: { paragraph?: number; sentences?: number[] };
  evidence?: unknown;
}

interface SentenceFlag {
  idx: number;
  text: string;
  word_count: number;
  flags: string[];
}

interface BurstinessSignal {
  score: number;
  cv: number;
  mean_sentence_length: number;
  reason?: Reason;
}

function burstinessSignal(sentences: string[]): BurstinessSignal {
  // Drop heading-like ultra-short "sentences" (1-2 words) — they pollute CV
  const lengths = sentences.map((s) => splitWords(s).length).filter((n) => n >= 3);
  if (lengths.length < 3) {
    return { score: 50, cv: 0, mean_sentence_length: lengths[0] ?? 0 };
  }
  const m = mean(lengths);
  const cv = stdev(lengths) / (m || 1);
  const HUMAN_OPT = 0.55;
  const HUMAN_LOW = 0.35;
  const score = cv < HUMAN_LOW
    ? Math.min(100, ((HUMAN_LOW - cv) / HUMAN_LOW) * 100)
    : cv > 0.9
      ? Math.min(100, ((cv - 0.9) / 0.5) * 60)
      : 0;
  let reason: Reason | undefined;
  if (cv < HUMAN_LOW) {
    reason = {
      code: "low_burstiness",
      severity: cv < 0.2 ? "high" : "medium",
      explanation: `Cümle uzunluk varyansı çok düşük (CV=${cv.toFixed(2)}). İnsan metinlerinde 0.4-0.7 beklenir; AI metinleri tekdüze ritim üretme eğilimindedir.`,
      evidence: { cv: Math.round(cv * 1000) / 1000, mean_length: Math.round(m * 100) / 100 },
    };
  }
  return { score: Math.round(score * 100) / 100, cv: Math.round(cv * 1000) / 1000, mean_sentence_length: Math.round(m * 100) / 100, reason };
}

interface AiPhraseSignal {
  score: number;
  hits: { phrase: string; count: number }[];
  total: number;
  reason?: Reason;
}

function aiPhraseSignal(text: string, lang: SupportedLanguage, sentenceCount: number): AiPhraseSignal {
  const phrases = AI_PHRASES[lang];
  if (!phrases.length) return { score: 0, hits: [], total: 0 };
  const lower = text.toLowerCase();
  const hits: { phrase: string; count: number }[] = [];
  let total = 0;
  for (const phrase of phrases) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(?:^|[^\\p{L}])${escaped}(?:[^\\p{L}]|$)`, "gu");
    const count = (lower.match(re) ?? []).length;
    if (count > 0) {
      hits.push({ phrase, count });
      total += count;
    }
  }
  hits.sort((a, b) => b.count - a.count);
  const density = total / Math.max(1, sentenceCount);
  const score = Math.min(100, density * 200);
  let reason: Reason | undefined;
  if (total >= 2 || density > 0.05) {
    reason = {
      code: "ai_phrase_cluster",
      severity: total >= 5 ? "high" : "medium",
      explanation: `${total} adet yüksek-frekanslı LLM kalıbı bulundu (cümle başına ${density.toFixed(3)}). Bu kelimeler gerçek dedektörlerin sözlüklerinde flag'li.`,
      evidence: { top: hits.slice(0, 8) },
    };
  }
  return { score: Math.round(score * 100) / 100, hits, total, reason };
}

interface FragmentListSignal {
  score: number;
  occurrences: { paragraph: number; consecutive_count: number; example: string }[];
  reason?: Reason;
}

function fragmentListSignal(paragraphs: string[], lang: SupportedLanguage): FragmentListSignal {
  const occurrences: { paragraph: number; consecutive_count: number; example: string }[] = [];
  paragraphs.forEach((para, idx) => {
    const sentences = splitSentences(para);
    let run = 0;
    let maxRun = 0;
    let exampleStart = -1;
    let exampleStartCandidate = -1;
    sentences.forEach((s, i) => {
      if (isFragment(s, lang)) {
        if (run === 0) exampleStartCandidate = i;
        run++;
        if (run > maxRun) {
          maxRun = run;
          exampleStart = exampleStartCandidate;
        }
      } else {
        run = 0;
      }
    });
    if (maxRun >= 3) {
      const example = sentences.slice(exampleStart, exampleStart + maxRun).join(" ");
      occurrences.push({ paragraph: idx, consecutive_count: maxRun, example: example.slice(0, 200) });
    }
  });
  const score = occurrences.length === 0 ? 0 : Math.min(100, occurrences.reduce((s, o) => s + o.consecutive_count * 15, 0));
  let reason: Reason | undefined;
  if (occurrences.length > 0) {
    reason = {
      code: "fragment_list_paragraph",
      severity: "high",
      explanation: `${occurrences.length} paragrafta ardışık fragman dizilimi tespit edildi ("X. Y. Z." kalıbı). Bu, LLM'in liste yapması gereken yerde fragmanlar üretmesinin klasik imzasıdır.`,
      evidence: occurrences,
      location: { paragraph: occurrences[0]!.paragraph },
    };
  }
  return { score: Math.round(score * 100) / 100, occurrences, reason };
}

interface ParallelStructureSignal {
  score: number;
  runs: { start_sentence: number; length: number; pattern: string }[];
  reason?: Reason;
}

function parallelStructureSignal(sentences: string[]): ParallelStructureSignal {
  const runs: { start_sentence: number; length: number; pattern: string }[] = [];
  if (sentences.length < 3) return { score: 0, runs: [] };
  const firstWords = sentences.map((s) => {
    const w = splitWords(s);
    return w[0]?.toLowerCase() ?? "";
  });
  const lengths = sentences.map((s) => splitWords(s).length);
  let runStart = 0;
  let runLen = 1;
  for (let i = 1; i < sentences.length; i++) {
    const fwCurr = firstWords[i] ?? "";
    const fwPrev = firstWords[i - 1] ?? "";
    const lenCurr = lengths[i] ?? 0;
    const lenPrev = lengths[i - 1] ?? 0;
    const sameStart = fwCurr.length > 0 && fwCurr === fwPrev;
    const closeLength = Math.abs(lenCurr - lenPrev) <= 2;
    if (sameStart || (closeLength && lenCurr >= 4 && lenCurr <= 12)) {
      runLen++;
    } else {
      if (runLen >= 3) {
        runs.push({ start_sentence: runStart, length: runLen, pattern: firstWords[runStart] ?? "" });
      }
      runStart = i;
      runLen = 1;
    }
  }
  if (runLen >= 3) runs.push({ start_sentence: runStart, length: runLen, pattern: firstWords[runStart] ?? "" });

  const score = runs.length === 0 ? 0 : Math.min(100, runs.reduce((s, r) => s + (r.length - 2) * 12, 0));
  let reason: Reason | undefined;
  if (runs.length > 0) {
    const longest = runs.reduce((a, b) => (a.length > b.length ? a : b));
    reason = {
      code: "parallel_structure_run",
      severity: longest.length >= 5 ? "high" : "medium",
      explanation: `Ardışık ${longest.length} cümle benzer yapıda (aynı kelimeyle başlama veya uzunluk). İnsan yazımında doğal kırılmalar olur.`,
      evidence: runs,
      location: { sentences: Array.from({ length: longest.length }, (_, i) => longest.start_sentence + i) },
    };
  }
  return { score: Math.round(score * 100) / 100, runs, reason };
}

interface EmDashSignal {
  score: number;
  count: number;
  density_per_sentence: number;
  reason?: Reason;
}

function emDashSignal(text: string, sentenceCount: number): EmDashSignal {
  const count = (text.match(/—|–/g) ?? []).length;
  const density = count / Math.max(1, sentenceCount);
  const score = Math.min(100, density * 200);
  let reason: Reason | undefined;
  if (density > 0.1) {
    reason = {
      code: "em_dash_overuse",
      severity: density > 0.3 ? "high" : "medium",
      explanation: `Em-dash yoğunluğu yüksek (cümle başına ${density.toFixed(3)}). LLM'lerin imza noktalama tercihi.`,
      evidence: { count, density: Math.round(density * 1000) / 1000 },
    };
  }
  return { score: Math.round(score * 100) / 100, count, density_per_sentence: Math.round(density * 1000) / 1000, reason };
}

interface NotXButYSignal {
  score: number;
  count: number;
  reason?: Reason;
}

const NOT_X_BUT_Y: Record<SupportedLanguage, RegExp> = {
  en: /\b(not (?:just |only |merely |simply )?[\w\s,]{1,40}?[,;]?\s*but(?: also| rather)?)\b/gi,
  tr: /\b(?:sadece|yalnızca|salt)\b[\w\s,]{1,40}?\b(?:değil(?:dir)?|olmayıp)\b[\w\s,]{1,40}?\b(?:aynı zamanda|ayrıca|hem de|bilakis)\b/gi,
  es: /\bno (?:solo |solamente )[\w\s,]{1,40}?(?:sino(?: también)?)\b/gi,
  de: /\bnicht nur [\w\s,]{1,40}?sondern(?: auch)?\b/gi,
  fr: /\bnon seulement [\w\s,]{1,40}?mais(?: aussi| également)?\b/gi,
  it: /\bnon solo [\w\s,]{1,40}?ma(?: anche)?\b/gi,
};

function notXButYSignal(text: string, lang: SupportedLanguage, sentenceCount: number): NotXButYSignal {
  const re = NOT_X_BUT_Y[lang];
  const count = (text.match(re) ?? []).length;
  const density = count / Math.max(1, sentenceCount);
  const score = Math.min(100, density * 400);
  let reason: Reason | undefined;
  if (count >= 2) {
    reason = {
      code: "not_x_but_y_pattern",
      severity: count >= 4 ? "high" : "medium",
      explanation: `"X değil Y" / "not just X but Y" retorik kalıbı ${count} kez kullanılmış. LLM'lerin sevdiği balanslı antitez yapısı; insan yazımında bu yoğunlukta nadir.`,
      evidence: { count },
    };
  }
  return { score: Math.round(score * 100) / 100, count, reason };
}

export interface AiDetectResult {
  language: SupportedLanguage;
  composite_score: number;
  verdict: "likely_human" | "uncertain" | "likely_ai" | "very_likely_ai";
  heuristic_score: number;
  llm_score?: number;
  signals: {
    burstiness: BurstinessSignal;
    ai_phrases: AiPhraseSignal;
    fragment_lists: FragmentListSignal;
    parallel_structure: ParallelStructureSignal;
    em_dash: EmDashSignal;
    not_x_but_y: NotXButYSignal;
    llm_panel?: PanelResult;
  };
  reasons: Reason[];
  per_sentence: SentenceFlag[];
  summary_advice: string[];
  stats: {
    sentences: number;
    paragraphs: number;
    words: number;
  };
}

const ADVICE: Record<SupportedLanguage, Partial<Record<string, string>>> = {
  tr: {
    low_burstiness: "Cümle uzunluklarını çeşitlendir: 3-6 kelimelik kısa cümlelerle 18-25 kelimelik uzun cümleleri karıştır.",
    ai_phrase_cluster: "Tespit edilen yüksek-frekanslı LLM kalıplarını (yukarıdaki 'evidence.top') kaldır veya değiştir.",
    fragment_list_paragraph: "Ardışık fragman içeren paragrafı akıcı tek bir cümleye dönüştür ya da gerçek bir madde-işaretli liste yap.",
    parallel_structure_run: "Aynı yapıda ardışık cümle dizisini kır: aralara farklı uzunluk veya farklı bağlaçla başlayan bir cümle koy.",
    em_dash_overuse: "Em-dash (—) sayısını azalt; bunların yerine virgül, parantez veya iki ayrı cümle kullan.",
    not_x_but_y_pattern: "'X değil Y' / 'sadece X değil aynı zamanda Y' kalıbını sayıca azalt; doğal cümlelerle değiştir.",
  },
  en: {
    low_burstiness: "Vary sentence lengths: mix 3-6 word short sentences with 18-25 word long ones.",
    ai_phrase_cluster: "Remove or replace the detected high-frequency LLM phrases (see evidence.top).",
    fragment_list_paragraph: "Convert the consecutive fragment paragraph into either a single flowing sentence or a real bulleted list.",
    parallel_structure_run: "Break consecutive same-structured sentences: insert one with different length or different opening word.",
    em_dash_overuse: "Reduce em-dashes (—); replace with commas, parentheses, or two separate sentences.",
    not_x_but_y_pattern: "Reduce 'not X but Y' constructions; replace with natural phrasing.",
  },
  es: {}, de: {}, fr: {}, it: {},
};

function buildPerSentence(
  sentences: string[],
  lang: SupportedLanguage,
  parallelRuns: ParallelStructureSignal["runs"],
  aiPhraseHits: AiPhraseSignal["hits"],
): SentenceFlag[] {
  const parallelIndices = new Set<number>();
  for (const r of parallelRuns) {
    for (let i = 0; i < r.length; i++) parallelIndices.add(r.start_sentence + i);
  }
  const phraseSet = new Set(aiPhraseHits.map((h) => h.phrase));
  const lengths = sentences.map((s) => splitWords(s).length);
  const m = mean(lengths);

  return sentences.map((s, idx) => {
    const flags: string[] = [];
    const lower = s.toLowerCase();
    for (const p of phraseSet) {
      if (lower.includes(p)) {
        flags.push("ai_phrase");
        break;
      }
    }
    if (isFragment(s, lang)) flags.push("fragment");
    if (parallelIndices.has(idx)) flags.push("parallel_run");
    const wc = lengths[idx] ?? 0;
    if (wc > 0 && Math.abs(wc - m) < 1.5 && lengths.length >= 5) {
      flags.push("monotone_length");
    }
    if (/—|–/.test(s)) flags.push("em_dash");

    return {
      idx,
      text: s.length > 200 ? s.slice(0, 200) + "…" : s,
      word_count: wc,
      flags,
    };
  });
}

function deriveVerdict(score: number, reasons: Reason[]): AiDetectResult["verdict"] {
  const high = reasons.filter((r) => r.severity === "high").length;
  const med = reasons.filter((r) => r.severity === "medium").length;
  if (score >= 75 || high >= 2) return "very_likely_ai";
  if (score >= 50 || high >= 1 || med >= 3) return "likely_ai";
  if (score >= 25 || med >= 1) return "uncertain";
  return "likely_human";
}

export interface AiDetectOptions {
  language?: SupportedLanguage | "auto";
  weights?: Partial<{
    burstiness: number;
    ai_phrases: number;
    fragment_lists: number;
    parallel_structure: number;
    em_dash: number;
    not_x_but_y: number;
  }>;
  llm?: {
    apiKey?: string;
    tier?: PanelTier;
    models?: string[];
    baseUrl?: string;
    weight?: number;
    timeoutMs?: number;
  };
}

const DEFAULT_WEIGHTS = {
  burstiness: 0.25,
  ai_phrases: 0.25,
  fragment_lists: 0.18,
  parallel_structure: 0.15,
  em_dash: 0.07,
  not_x_but_y: 0.10,
};

export async function aiDetectScore(text: string, opts: AiDetectOptions = {}): Promise<AiDetectResult> {
  const lang = opts.language && opts.language !== "auto" ? opts.language : detectLanguage(text);
  const sentences = splitSentences(text);
  const paragraphs = splitParagraphs(text);
  const words = splitWords(text);

  const burstiness = burstinessSignal(sentences);
  const ai_phrases = aiPhraseSignal(text, lang, sentences.length);
  const fragment_lists = fragmentListSignal(paragraphs, lang);
  const parallel_structure = parallelStructureSignal(sentences);
  const em_dash = emDashSignal(text, sentences.length);
  const not_x_but_y = notXButYSignal(text, lang, sentences.length);

  const w = { ...DEFAULT_WEIGHTS, ...(opts.weights ?? {}) };
  const total = w.burstiness + w.ai_phrases + w.fragment_lists + w.parallel_structure + w.em_dash + w.not_x_but_y;
  const heuristic_score =
    (burstiness.score * w.burstiness +
      ai_phrases.score * w.ai_phrases +
      fragment_lists.score * w.fragment_lists +
      parallel_structure.score * w.parallel_structure +
      em_dash.score * w.em_dash +
      not_x_but_y.score * w.not_x_but_y) / total;

  const reasons: Reason[] = [];
  if (burstiness.reason) reasons.push(burstiness.reason);
  if (ai_phrases.reason) reasons.push(ai_phrases.reason);
  if (fragment_lists.reason) reasons.push(fragment_lists.reason);
  if (parallel_structure.reason) reasons.push(parallel_structure.reason);
  if (em_dash.reason) reasons.push(em_dash.reason);
  if (not_x_but_y.reason) reasons.push(not_x_but_y.reason);

  let panel: PanelResult | undefined;
  let llm_score: number | undefined;
  const wantsPanel = !!opts.llm?.apiKey && (opts.llm?.tier !== undefined || (opts.llm?.models && opts.llm.models.length > 0));
  if (wantsPanel && opts.llm?.apiKey) {
    const models = opts.llm.models && opts.llm.models.length > 0
      ? opts.llm.models
      : modelsForTier(opts.llm.tier ?? "premium");
    panel = await llmPanel(text, lang, {
      apiKey: opts.llm.apiKey,
      models,
      baseUrl: opts.llm.baseUrl,
      timeoutMs: opts.llm.timeoutMs,
    });
    if (panel.models_used.length > 0) {
      llm_score = panel.composite_score;
      for (const c of panel.consensus_reasons) {
        const dist = c.severity_distribution;
        const sev: "low" | "medium" | "high" = dist.high > 0 ? "high" : dist.medium > 0 ? "medium" : "low";
        reasons.push({
          code: `llm_consensus:${c.code}`,
          severity: sev,
          explanation: `${c.judges.length} judge consensus — ${c.representative_explanation}`,
          evidence: { judges: c.judges, quoted: c.quoted_evidence, severity_distribution: dist },
        });
      }
    }
  }

  const llmWeight = opts.llm?.weight ?? 0.6;
  const composite_score =
    llm_score !== undefined
      ? heuristic_score * (1 - llmWeight) + llm_score * llmWeight
      : heuristic_score;

  const adviceMap = ADVICE[lang] ?? ADVICE.en;
  const summary_advice: string[] = [];
  for (const r of reasons) {
    const a = adviceMap[r.code];
    if (a) summary_advice.push(a);
  }
  if (panel?.combined_recommendations) {
    for (const rec of panel.combined_recommendations) {
      if (!summary_advice.includes(rec)) summary_advice.push(rec);
    }
  }

  return {
    language: lang,
    composite_score: Math.round(composite_score * 100) / 100,
    verdict: deriveVerdict(composite_score, reasons),
    heuristic_score: Math.round(heuristic_score * 100) / 100,
    llm_score: llm_score !== undefined ? Math.round(llm_score * 100) / 100 : undefined,
    signals: { burstiness, ai_phrases, fragment_lists, parallel_structure, em_dash, not_x_but_y, llm_panel: panel },
    reasons,
    per_sentence: buildPerSentence(sentences, lang, parallel_structure.runs, ai_phrases.hits),
    summary_advice,
    stats: {
      sentences: sentences.length,
      paragraphs: paragraphs.length,
      words: words.length,
    },
  };
}
