export type SupportedLanguage = "en" | "tr" | "es" | "de" | "fr" | "it" | "ru" | "ar";

// Closing quotes and brackets sit between the terminator and the space, so
// without them `He said "hello." Then he left.` reads as a single sentence.
// U+061F is the Arabic question mark and U+061B the Arabic semicolon; both end
// a sentence and neither is matched by the Latin set.
const SENTENCE_SPLIT = /[.!?…؟؛]+["'’»”)\]]*(?:\s+|$)|[\n\r]+/u;
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
/**
 * Strips the optional diacritics and unifies the letter shapes that Arabic
 * writes interchangeably. This is load-bearing rather than cosmetic: the same
 * sentence written with full tashkeel has roughly twice the characters of its
 * plain form, which would double every character-based measurement.
 */
const ARABIC_DIACRITICS = /[\u064B-\u065F\u0670\u0640]/g;

export function normalizeArabic(text: string): string {
  return text
    .replace(ARABIC_DIACRITICS, "")
    .replace(/[\u0623\u0625\u0622\u0671]/g, "\u0627")
    .replace(/\u0649/g, "\u064A")
    .replace(/\u0629/g, "\u0647")
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

/** Language-specific preprocessing applied before any statistic is computed. */
export function prepare(text: string, lang: SupportedLanguage): string {
  return lang === "ar" ? normalizeArabic(text) : text;
}

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
  // Arabic is normally written without short vowels, so only the three long
  // vowels are visible. This is a poor syllable estimate and the Arabic
  // formulas deliberately do not use it — see src/scorers/ar.ts.
  ar: /[اوي]/g,
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

export function basicStats(rawText: string, lang: SupportedLanguage): BasicStats {
  const text = prepare(rawText, lang);
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
