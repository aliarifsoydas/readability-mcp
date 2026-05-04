export type SupportedLanguage = "en" | "tr" | "es" | "de" | "fr" | "it";

const SENTENCE_SPLIT = /[.!?…]+(?:\s+|$)|[\n\r]+/u;
const WORD_SPLIT = /[\p{L}\p{M}\p{N}'’\-]+/gu;

export function splitSentences(text: string): string[] {
  return text
    .split(SENTENCE_SPLIT)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function splitWords(text: string): string[] {
  return text.match(WORD_SPLIT) ?? [];
}

export function letterCount(words: string[]): number {
  let n = 0;
  for (const w of words) {
    n += (w.match(/\p{L}/gu) ?? []).length;
  }
  return n;
}

const VOWELS = {
  en: /[aeiouy]+/g,
  tr: /[aeıioöuüâîû]/g,
  es: /[aeiouáéíóúü]+/g,
  de: /[aeiouyäöü]+/g,
  fr: /[aeiouyàâäéèêëîïôöùûüÿœæ]+/g,
  it: /[aeiouàèéìíîòóùú]+/g,
} as const;

export function countSyllables(word: string, lang: SupportedLanguage): number {
  const w = word.toLowerCase();
  if (!w) return 0;
  if (lang === "tr") {
    return (w.match(VOWELS.tr) ?? []).length || 1;
  }
  if (lang === "en") {
    let s = w.replace(/[^a-z]/g, "");
    if (!s) return 1;
    if (s.length <= 3) return 1;
    s = s.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "");
    s = s.replace(/^y/, "");
    const m = s.match(/[aeiouy]{1,2}/g);
    return m ? m.length : 1;
  }
  const m = w.match(VOWELS[lang]);
  return m ? m.length : 1;
}

export function totalSyllables(words: string[], lang: SupportedLanguage): number {
  let n = 0;
  for (const w of words) n += countSyllables(w, lang);
  return n;
}

export interface BasicStats {
  characters: number;
  words: number;
  sentences: number;
  syllables: number;
  avgWordLength: number;
  avgSentenceLength: number;
  avgSyllablesPerWord: number;
}

export function basicStats(text: string, lang: SupportedLanguage): BasicStats {
  const sentences = splitSentences(text);
  const words = splitWords(text);
  const sCount = sentences.length || 1;
  const wCount = words.length || 1;
  const letters = letterCount(words);
  const syl = totalSyllables(words, lang);
  return {
    characters: letters,
    words: words.length,
    sentences: sentences.length,
    syllables: syl,
    avgWordLength: letters / wCount,
    avgSentenceLength: wCount / sCount,
    avgSyllablesPerWord: syl / wCount,
  };
}

export function round(n: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
