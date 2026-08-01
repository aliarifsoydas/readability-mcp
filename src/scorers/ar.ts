import { basicStats, round } from "../text.js";
import type { RawScoreResult } from "./types.js";

/**
 * Arabic is written without short vowels, so its syllables are not recoverable
 * from the text. Every formula that depends on counting them collapses. Measured
 * on the BAREC corpus (Spearman against mean sentence level, 1330 documents):
 *
 *   OSMAN                +0.05    its complex-word term needs four diacritics
 *                                 per word and is exactly 0 in most documents
 *   Arabic Flesch        +0.16    syllables per word
 *   Arabic Kincaid       -0.11    syllables per word
 *   Arabic LIX           +0.66    usable, but its anchors are not monotone
 *   Arabic ARI           +0.76    characters per word — no syllables needed
 *   AWL x lg(ASL)        +0.78    best measured
 *
 * So this scorer ships the two that work and leaves the rest out rather than
 * carrying a formula with no signal for the sake of citing it.
 */

/**
 * Average word length in characters, scaled by the log of average sentence
 * length. The same shape as Tuldava's index for Russian, with characters
 * standing in for the syllables Arabic does not expose.
 */
function awlAslIndex(asl: number, awl: number): number {
  return awl * Math.log10(Math.max(asl, 1.0001));
}

/** Arabic ARI, ported from the OSMAN reference implementation. */
function arabicAri(asl: number, awl: number): number {
  return 4.71 * awl + 0.5 * asl - 21.43;
}

/** Bands follow the BAREC level the value was measured at. */
function interpretIndex(score: number): string {
  if (score <= 2.2) return "سهل جدًا (الصفوف الأولى)";
  if (score <= 3.2) return "سهل (المرحلة الابتدائية)";
  if (score <= 4.5) return "متوسط (المرحلة الإعدادية)";
  if (score <= 5.9) return "صعب (المرحلة الثانوية)";
  return "صعب جدًا (جامعي أو أكاديمي)";
}

function interpretAri(score: number): string {
  if (score <= 0) return "سهل جدًا";
  if (score <= 2.5) return "سهل";
  if (score <= 6.5) return "متوسط";
  if (score <= 11) return "صعب";
  return "صعب جدًا";
}

export function scoreArabic(text: string): RawScoreResult {
  const stats = basicStats(text, "ar");
  const idx = awlAslIndex(stats.avgSentenceLength, stats.avgWordLength);
  const ari = arabicAri(stats.avgSentenceLength, stats.avgWordLength);

  return {
    language: "ar",
    interpretation: `المؤشر: ${interpretIndex(idx)} | ARI: ${interpretAri(ari)}`,
    metrics: {
      awl_asl_index: round(idx, 3),
      arabic_ari: round(ari),
    },
    stats: {
      characters: stats.characters,
      words: stats.words,
      sentences: stats.sentences,
      syllables: stats.syllables,
      avg_word_length: round(stats.avgWordLength),
      avg_sentence_length: round(stats.avgSentenceLength),
      avg_syllables_per_word: round(stats.avgSyllablesPerWord, 3),
    },
  };
}
