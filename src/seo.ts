import type { SupportedLanguage } from "./text.js";
import { scoreText } from "./scorers/index.js";
import { flowScore } from "./flow.js";

export const SUPPORTED_FORMULAS = [
  "flesch_reading_ease",
  "flesch_kincaid_grade",
  "gunning_fog",
  "smog_index",
  "coleman_liau_index",
  "automated_readability_index",
  "atesman",
  "bezirci_yilmaz",
  "cetinkaya_uzun",
  "fernandez_huerta",
  "szigriszt_pazos",
  "flesch_deutsch",
  "wiener_sachtextformel",
  "kandel_moles",
  "gulpease",
] as const;

export type Formula = (typeof SUPPORTED_FORMULAS)[number];

const DEFAULT_FORMULA: Record<SupportedLanguage, Formula> = {
  en: "flesch_reading_ease",
  tr: "atesman",
  es: "fernandez_huerta",
  de: "flesch_deutsch",
  fr: "kandel_moles",
  it: "gulpease",
};

interface VerdictBundle {
  ready: string;
  simplify: string;
  improveFlow: string;
  revise: string;
  suggestions: { simplify: string[]; improveFlow: string[] };
}

const MESSAGES: Record<SupportedLanguage, VerdictBundle> = {
  tr: {
    ready: "SEO için yayına hazır",
    simplify: "Okunabilirlik düşük: cümleleri kısalt, uzun isim öbeklerini böl",
    improveFlow: "Akış zayıf: cümle uzunluklarını çeşitlendir, bağlaç/geçiş kelimeleri ekle",
    revise: "Genel revizyon gerekli — hem okunabilirlik hem akış zayıf",
    suggestions: {
      simplify: [
        "Ortalama cümle uzunluğunu 15 kelimenin altına çek",
        "Uzun Türkçe kelimeleri (5+ heceli) sade alternatiflerle değiştir",
        "İki bağımsız fikri tek cümlede değil, iki cümlede ver",
      ],
      improveFlow: [
        "Kısa ve uzun cümleleri sırala — monoton ritimden kaçın",
        "Geçiş bağlaçları ekle: 'ancak', 'böylece', 'öte yandan', 'ayrıca'",
        "Aynı kelimenin tekrarını azalt; eş anlamlı kullan",
      ],
    },
  },
  en: {
    ready: "SEO ready",
    simplify: "Readability weak: shorten sentences and simplify long words",
    improveFlow: "Flow weak: vary sentence lengths and add transition words",
    revise: "Major revision needed — both readability and flow are weak",
    suggestions: {
      simplify: [
        "Keep average sentence length under 20 words",
        "Replace long words (3+ syllables) with simpler alternatives where possible",
        "Split compound sentences into two when both halves carry separate ideas",
      ],
      improveFlow: [
        "Alternate short and long sentences to avoid monotonous rhythm",
        "Add transition words: 'however', 'therefore', 'meanwhile', 'in addition'",
        "Reduce word repetition; use synonyms",
      ],
    },
  },
  es: { ready: "Listo para SEO", simplify: "Legibilidad baja: acorta frases", improveFlow: "Flujo débil: varía longitud de frases", revise: "Revisión general necesaria", suggestions: { simplify: [], improveFlow: [] } },
  de: { ready: "SEO-bereit", simplify: "Lesbarkeit schwach: Sätze kürzen", improveFlow: "Fluss schwach: Satzlängen variieren", revise: "Grundlegende Überarbeitung nötig", suggestions: { simplify: [], improveFlow: [] } },
  fr: { ready: "Prêt pour le SEO", simplify: "Lisibilité faible: raccourcir les phrases", improveFlow: "Flux faible: varier la longueur des phrases", revise: "Révision globale nécessaire", suggestions: { simplify: [], improveFlow: [] } },
  it: { ready: "Pronto per SEO", simplify: "Leggibilità bassa: accorcia le frasi", improveFlow: "Flusso debole: varia la lunghezza delle frasi", revise: "Revisione generale necessaria", suggestions: { simplify: [], improveFlow: [] } },
};

export interface SeoScoreOptions {
  formula?: Formula;
  language?: SupportedLanguage | "auto";
  threshold?: number;
  weight_readability?: number;
}

export function seoScore(text: string, opts: SeoScoreOptions = {}) {
  const threshold = opts.threshold ?? 70;
  const wRead = opts.weight_readability ?? 0.5;
  const wFlow = 1 - wRead;

  const reading = scoreText(text, opts.language ?? "auto");
  const flow = flowScore(text, opts.language ?? "auto");
  const lang = reading.language as SupportedLanguage;

  const chosenFormula: Formula = opts.formula ?? DEFAULT_FORMULA[lang];
  const readability100 = reading.metrics_100[chosenFormula];
  const readabilityRaw = reading.metrics[chosenFormula];

  if (readability100 === undefined) {
    throw new Error(
      `Formula '${chosenFormula}' is not available for language '${lang}'. ` +
        `Available formulas for ${lang}: ${Object.keys(reading.metrics).join(", ")}`,
    );
  }

  const overall = readability100 * wRead + flow.overall_100 * wFlow;
  const msg = MESSAGES[lang];
  const readOk = readability100 >= threshold;
  const flowOk = flow.overall_100 >= threshold;

  let verdict: string;
  let suggestions: string[] = [];
  if (readOk && flowOk) {
    verdict = msg.ready;
  } else if (!readOk && flowOk) {
    verdict = msg.simplify;
    suggestions = msg.suggestions.simplify;
  } else if (readOk && !flowOk) {
    verdict = msg.improveFlow;
    suggestions = msg.suggestions.improveFlow;
  } else {
    verdict = msg.revise;
    suggestions = [...msg.suggestions.simplify, ...msg.suggestions.improveFlow];
  }

  return {
    language: lang,
    formula: chosenFormula,
    threshold,
    weights: { readability: wRead, flow: wFlow },
    readability_100: readability100,
    readability_raw: readabilityRaw,
    flow_100: flow.overall_100,
    overall_100: Math.round(overall * 100) / 100,
    passed: readOk && flowOk,
    verdict,
    suggestions,
    breakdown: {
      flow_metrics: flow.metrics_100,
      flow_details: flow.details,
    },
  };
}
