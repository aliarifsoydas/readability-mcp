export type SupportedLanguage = "en" | "tr" | "es" | "de" | "fr" | "it" | "ru";

// Closing quotes and brackets sit between the terminator and the space, so
// without them `He said "hello." Then he left.` reads as a single sentence.
const SENTENCE_SPLIT = /[.!?…]+["'’»”)\]]*(?:\s+|$)|[\n\r]+/u;
// A token must contain a letter or digit; apostrophes and hyphens may only
// join them. Otherwise a markdown bullet's leading `-` counts as a word,
// which inflates word counts and makes every bullet share a first token.
const WORD_SPLIT = /[\p{L}\p{M}\p{N}]+(?:['’\-][\p{L}\p{M}\p{N}]+)*/gu;

export function splitSentences(text: string): string[] {
  return text
    .split(SENTENCE_SPLIT)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function splitWords(text: string): string[] {
  return text.match(WORD_SPLIT) ?? [];
}

/**
 * Turkish needs locale-aware folding. JS invariant lowercasing maps "İ" to "i"
 * plus a combining dot (U+0307) and "I" to "i" rather than "ı", so a
 * sentence-initial "İfade" or an all-caps "GELMİŞTİR" never matches a lexicon
 * entry spelled the ordinary way.
 */
export function foldCase(text: string, lang: SupportedLanguage): string {
  return lang === "tr" ? text.toLocaleLowerCase("tr") : text.toLowerCase();
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
  ru: /[аеёиоуыэюя]/g,
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
