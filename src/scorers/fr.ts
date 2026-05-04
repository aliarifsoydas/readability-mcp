import { basicStats, round } from "../text.js";
import type { ScoreResult } from "./types.js";

function kandelMoles(asl: number, asw: number): number {
  return 207 - 1.015 * asl - 73.6 * asw;
}

function interpret(score: number): string {
  if (score >= 80) return "Très facile";
  if (score >= 60) return "Facile";
  if (score >= 40) return "Moyen";
  if (score >= 20) return "Difficile";
  return "Très difficile";
}

export function scoreFrench(text: string): ScoreResult {
  const stats = basicStats(text, "fr");
  const km = kandelMoles(stats.avgSentenceLength, stats.avgSyllablesPerWord);
  return {
    language: "fr",
    interpretation: interpret(km),
    metrics: {
      kandel_moles: round(km),
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
