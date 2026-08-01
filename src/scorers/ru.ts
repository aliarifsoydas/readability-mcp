import { basicStats, splitWords, countSyllables, round } from "../text.js";
import type { RawScoreResult } from "./types.js";

/**
 * Coefficients follow Ivanov, Solnyshkina & Solovyev (Dialogue 2018),
 * "Efficiency of Text Readability Features in Russian Academic Texts", §2.
 * The raw scales are calibrated on Russian, not ported from English.
 */

/** Oborneva (2006): Flesch Reading Ease refitted on a Russian corpus. */
function oborneva(asl: number, asw: number): number {
  return 206.836 - 1.52 * asl - 65.14 * asw;
}

/** Matskovskiy (1976). x4 = percentage of words longer than 3 syllables. */
function matskovskiy(asl: number, x4: number): number {
  return 0.62 * asl + 0.123 * x4 + 0.051;
}

/** Tuldava (1975): i x lg(j), where i = syllables/word and j = words/sentence. */
function tuldava(asl: number, asw: number): number {
  // asl is clamped at 1 because lg(0) is -Infinity for an empty text.
  return asw * Math.log10(Math.max(asl, 1));
}

/** Share of words with more than 3 syllables, as a percentage. */
function longWordPercentage(text: string): number {
  const words = splitWords(text);
  if (words.length === 0) return 0;
  let long = 0;
  for (const word of words) {
    if (countSyllables(word, "ru") > 3) long++;
  }
  return (long / words.length) * 100;
}

/**
 * Bands come from the grade-level corpus in the same paper (Table 1): a 5th
 * grade textbook scores around +36 and an 11th grade one around -25, so the
 * classic 0-100 Flesch bands do not apply.
 */
function interpretOborneva(score: number): string {
  if (score >= 40) return "Очень легко (начальная школа)";
  if (score >= 20) return "Легко (5-6 класс)";
  if (score >= 0) return "Средне (7-8 класс)";
  if (score >= -20) return "Сложно (9-10 класс)";
  return "Очень сложно (11 класс, академический текст)";
}

function interpretMatskovskiy(score: number): string {
  if (score <= 8) return "Уровень начальной школы";
  if (score <= 12) return "Уровень средней школы";
  if (score <= 16) return "Уровень старшей школы";
  return "Академический уровень";
}

function interpretTuldava(score: number): string {
  if (score <= 2.6) return "Простой текст";
  if (score <= 3.1) return "Умеренно простой";
  if (score <= 3.5) return "Средней сложности";
  if (score <= 3.9) return "Сложный";
  return "Очень сложный";
}

export function scoreRussian(text: string): RawScoreResult {
  const stats = basicStats(text, "ru");
  const x4 = longWordPercentage(text);
  const ob = oborneva(stats.avgSentenceLength, stats.avgSyllablesPerWord);
  const mt = matskovskiy(stats.avgSentenceLength, x4);
  const td = tuldava(stats.avgSentenceLength, stats.avgSyllablesPerWord);

  return {
    language: "ru",
    interpretation: `Оборнева: ${interpretOborneva(ob)} | Мацковский: ${interpretMatskovskiy(mt)} | Тулдава: ${interpretTuldava(td)}`,
    metrics: {
      oborneva: round(ob),
      matskovskiy: round(mt),
      tuldava: round(td, 3),
    },
    stats: {
      characters: stats.characters,
      words: stats.words,
      sentences: stats.sentences,
      syllables: stats.syllables,
      avg_word_length: round(stats.avgWordLength),
      avg_sentence_length: round(stats.avgSentenceLength),
      avg_syllables_per_word: round(stats.avgSyllablesPerWord, 3),
      long_word_percentage: round(x4),
    },
  };
}
