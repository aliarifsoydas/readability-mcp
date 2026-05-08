import { basicStats, round } from "../text.js";
import type { RawScoreResult } from "./types.js";

function gulpease(letters: number, words: number, sentences: number): number {
  const w = words || 1;
  return 89 - (10 * letters) / w + (300 * sentences) / w;
}

function interpret(score: number): string {
  if (score >= 80) return "Molto facile (elementare)";
  if (score >= 60) return "Facile (medie)";
  if (score >= 40) return "Difficile (superiori)";
  return "Molto difficile (universitario)";
}

export function scoreItalian(text: string): RawScoreResult {
  const stats = basicStats(text, "it");
  const g = gulpease(stats.characters, stats.words, stats.sentences);
  return {
    language: "it",
    interpretation: interpret(g),
    metrics: {
      gulpease: round(g),
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
