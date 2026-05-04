import type { SupportedLanguage } from "../text.js";
import type { ScoreResult } from "./types.js";
import { scoreEnglish } from "./en.js";
import { scoreTurkish } from "./tr.js";
import { scoreSpanish } from "./es.js";
import { scoreGerman } from "./de.js";
import { scoreFrench } from "./fr.js";
import { scoreItalian } from "./it.js";

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = ["en", "tr", "es", "de", "fr", "it"];

const STOPWORDS: Record<SupportedLanguage, string[]> = {
  en: ["the", "and", "of", "to", "in", "is", "that", "for", "with", "as", "this", "it", "be", "are"],
  tr: ["bir", "ve", "bu", "de", "da", "için", "ile", "olan", "olarak", "değil", "ama", "çok", "ne", "ki"],
  es: ["el", "la", "los", "las", "de", "que", "y", "en", "un", "una", "por", "con", "para", "es"],
  de: ["der", "die", "das", "und", "ist", "von", "zu", "den", "ein", "eine", "mit", "auf", "für", "nicht"],
  fr: ["le", "la", "les", "de", "des", "et", "un", "une", "que", "qui", "dans", "pour", "pas", "est"],
  it: ["il", "la", "lo", "gli", "le", "di", "che", "e", "un", "una", "per", "con", "non", "è"],
};

export function detectLanguage(text: string): SupportedLanguage {
  const lower = text.toLowerCase();
  const tokens = lower.match(/[\p{L}]+/gu) ?? [];
  if (tokens.length === 0) return "en";

  const tokenSet = new Set(tokens);
  const scores: Record<SupportedLanguage, number> = { en: 0, tr: 0, es: 0, de: 0, fr: 0, it: 0 };

  for (const lang of SUPPORTED_LANGUAGES) {
    for (const sw of STOPWORDS[lang]) {
      if (tokenSet.has(sw)) scores[lang]++;
    }
  }

  if (/[ığşı]/.test(lower)) scores.tr += 5;
  if (/ß/.test(lower)) scores.de += 5;
  if (/[ñ¿¡]/.test(lower)) scores.es += 5;
  if (/[œæçàâ]/.test(lower)) scores.fr += 3;
  if (/[äöü]/.test(lower) && !/[ığş]/.test(lower)) scores.de += 2;

  let best: SupportedLanguage = "en";
  let bestScore = -1;
  for (const lang of SUPPORTED_LANGUAGES) {
    if (scores[lang] > bestScore) {
      bestScore = scores[lang];
      best = lang;
    }
  }
  return best;
}

export function scoreText(text: string, language: SupportedLanguage | "auto" = "auto"): ScoreResult {
  const lang = language === "auto" ? detectLanguage(text) : language;
  switch (lang) {
    case "en": return scoreEnglish(text);
    case "tr": return scoreTurkish(text);
    case "es": return scoreSpanish(text);
    case "de": return scoreGerman(text);
    case "fr": return scoreFrench(text);
    case "it": return scoreItalian(text);
  }
}
