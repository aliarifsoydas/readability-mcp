import { splitSentences, splitWords, type SupportedLanguage } from "./text.js";
import { detectLanguage } from "./scorers/index.js";

const CONNECTIVES: Record<SupportedLanguage, Set<string>> = {
  tr: new Set([
    "ancak", "ama", "fakat", "lakin", "oysa", "halbuki",
    "ayrıca", "üstelik", "bunun yanında", "ek olarak", "bunun yanı sıra",
    "böylece", "böylelikle", "bu sayede", "bu nedenle", "bu yüzden", "dolayısıyla",
    "çünkü", "zira", "öyleyse", "bu durumda",
    "ardından", "sonra", "daha sonra", "önce", "öncelikle", "son olarak", "nihayet",
    "öte yandan", "diğer yandan", "buna karşın", "buna karşılık", "yine de", "rağmen",
    "örneğin", "mesela", "yani", "kısacası", "özetle",
    "ve", "veya", "ya da", "ile", "ise",
  ]),
  en: new Set([
    "however", "but", "yet", "although", "though", "whereas", "while",
    "furthermore", "moreover", "additionally", "also", "besides", "in addition",
    "therefore", "thus", "hence", "consequently", "so", "as a result", "accordingly",
    "because", "since", "as",
    "then", "afterwards", "subsequently", "next", "finally", "eventually", "meanwhile",
    "on the other hand", "in contrast", "conversely", "nevertheless", "nonetheless", "still",
    "for example", "for instance", "such as", "namely", "in other words", "in short",
    "and", "or",
  ]),
  es: new Set([
    "pero", "sin embargo", "no obstante", "aunque", "mientras",
    "además", "asimismo", "también",
    "por lo tanto", "así que", "entonces", "en consecuencia", "por eso", "por consiguiente",
    "porque", "ya que", "puesto que", "dado que",
    "luego", "después", "finalmente", "por último", "mientras tanto",
    "por otra parte", "en cambio", "a pesar de",
    "por ejemplo", "es decir", "en resumen",
    "y", "o",
  ]),
  de: new Set([
    "aber", "jedoch", "doch", "obwohl", "während",
    "außerdem", "zudem", "darüber hinaus", "ferner", "auch",
    "deshalb", "deswegen", "daher", "folglich", "somit", "also",
    "weil", "denn", "da",
    "dann", "danach", "anschließend", "schließlich", "zuletzt", "inzwischen",
    "andererseits", "im gegensatz", "trotzdem", "dennoch",
    "zum beispiel", "etwa", "kurz gesagt",
    "und", "oder",
  ]),
  fr: new Set([
    "mais", "cependant", "toutefois", "néanmoins", "bien que", "alors que",
    "de plus", "en outre", "par ailleurs", "également", "aussi",
    "donc", "ainsi", "par conséquent", "c'est pourquoi",
    "parce que", "puisque", "car",
    "ensuite", "puis", "enfin", "finalement", "pendant ce temps",
    "d'autre part", "en revanche", "malgré", "pourtant",
    "par exemple", "c'est-à-dire", "en résumé",
    "et", "ou",
  ]),
  it: new Set([
    "ma", "però", "tuttavia", "sebbene", "mentre", "nonostante",
    "inoltre", "anche", "altresì", "in più",
    "quindi", "perciò", "dunque", "pertanto", "di conseguenza",
    "perché", "poiché", "siccome",
    "poi", "dopo", "successivamente", "infine", "intanto",
    "d'altra parte", "invece", "al contrario", "comunque",
    "ad esempio", "cioè", "in sintesi",
    "e", "o",
  ]),
};

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

function bellScore(value: number, optimum: number, width: number): number {
  return 100 * Math.exp(-((value - optimum) ** 2) / (2 * width * width));
}

function rhythmScore(text: string): { score: number; coefficient_of_variation: number; mean_sentence_length: number } {
  const sentences = splitSentences(text);
  const lengths = sentences.map((s) => splitWords(s).length).filter((n) => n > 0);
  if (lengths.length < 2) {
    return { score: 0, coefficient_of_variation: 0, mean_sentence_length: lengths[0] ?? 0 };
  }
  const m = mean(lengths);
  const cv = stdev(lengths) / (m || 1);
  const score = bellScore(cv, 0.5, 0.25);
  return {
    score: Math.round(score * 100) / 100,
    coefficient_of_variation: Math.round(cv * 1000) / 1000,
    mean_sentence_length: Math.round(m * 100) / 100,
  };
}

function lexicalDiversityScore(text: string): { score: number; mattr: number; window_size: number } {
  const tokens = splitWords(text).map((w) => w.toLowerCase());
  const window = 50;
  if (tokens.length === 0) return { score: 0, mattr: 0, window_size: window };
  if (tokens.length <= window) {
    const ttr = new Set(tokens).size / tokens.length;
    const score = Math.max(0, Math.min(100, ((ttr - 0.3) / (0.85 - 0.3)) * 100));
    return { score: Math.round(score * 100) / 100, mattr: Math.round(ttr * 1000) / 1000, window_size: tokens.length };
  }
  const ttrs: number[] = [];
  for (let i = 0; i + window <= tokens.length; i++) {
    const slice = tokens.slice(i, i + window);
    ttrs.push(new Set(slice).size / window);
  }
  const mattr = mean(ttrs);
  const score = Math.max(0, Math.min(100, ((mattr - 0.3) / (0.85 - 0.3)) * 100));
  return {
    score: Math.round(score * 100) / 100,
    mattr: Math.round(mattr * 1000) / 1000,
    window_size: window,
  };
}

function connectiveScore(text: string, lang: SupportedLanguage): {
  score: number;
  connectives_per_sentence: number;
  total_connectives: number;
} {
  const list = CONNECTIVES[lang];
  const sentences = splitSentences(text);
  const sCount = sentences.length || 1;
  const lower = text.toLowerCase();
  let total = 0;
  for (const phrase of list) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(?:^|[^\\p{L}])${escaped}(?:[^\\p{L}]|$)`, "gu");
    total += (lower.match(re) ?? []).length;
  }
  const ratio = total / sCount;
  const score = bellScore(ratio, 0.4, 0.35);
  return {
    score: Math.round(score * 100) / 100,
    connectives_per_sentence: Math.round(ratio * 1000) / 1000,
    total_connectives: total,
  };
}

export interface FlowResult {
  language: SupportedLanguage;
  overall_100: number;
  metrics_100: {
    rhythm: number;
    lexical_diversity: number;
    connective_density: number;
  };
  details: {
    rhythm: { coefficient_of_variation: number; mean_sentence_length: number };
    lexical_diversity: { mattr: number; window_size: number };
    connective_density: { connectives_per_sentence: number; total_connectives: number };
  };
  interpretation: string;
}

function interpret(score: number, lang: SupportedLanguage): string {
  const lib: Record<SupportedLanguage, [string, string, string, string]> = {
    tr: ["Çok akıcı", "Akıcı", "Orta akış", "Düşük akış"],
    en: ["Very fluent", "Fluent", "Moderate flow", "Choppy"],
    es: ["Muy fluido", "Fluido", "Flujo moderado", "Entrecortado"],
    de: ["Sehr flüssig", "Flüssig", "Mäßiger Fluss", "Stockend"],
    fr: ["Très fluide", "Fluide", "Débit modéré", "Saccadé"],
    it: ["Molto fluido", "Fluido", "Flusso moderato", "Spezzato"],
  };
  const [a, b, c, d] = lib[lang];
  if (score >= 80) return a;
  if (score >= 60) return b;
  if (score >= 40) return c;
  return d;
}

export function flowScore(text: string, language: SupportedLanguage | "auto" = "auto"): FlowResult {
  const lang = language === "auto" ? detectLanguage(text) : language;
  const r = rhythmScore(text);
  const ld = lexicalDiversityScore(text);
  const c = connectiveScore(text, lang);
  const overall = Math.round(((r.score + ld.score + c.score) / 3) * 100) / 100;
  return {
    language: lang,
    overall_100: overall,
    metrics_100: {
      rhythm: r.score,
      lexical_diversity: ld.score,
      connective_density: c.score,
    },
    details: {
      rhythm: { coefficient_of_variation: r.coefficient_of_variation, mean_sentence_length: r.mean_sentence_length },
      lexical_diversity: { mattr: ld.mattr, window_size: ld.window_size },
      connective_density: { connectives_per_sentence: c.connectives_per_sentence, total_connectives: c.total_connectives },
    },
    interpretation: interpret(overall, lang),
  };
}
