import { basicStats, round } from "../text.js";
import type { ScoreResult } from "./types.js";

function fernandezHuerta(asl: number, asw: number): number {
  return 206.84 - 60 * asw - 1.02 * asl;
}

function szigriszt(asl: number, asw: number): number {
  return 206.835 - 62.3 * asw - asl;
}

function interpret(score: number): string {
  if (score >= 90) return "Muy fácil";
  if (score >= 80) return "Fácil";
  if (score >= 70) return "Bastante fácil";
  if (score >= 60) return "Normal";
  if (score >= 50) return "Algo difícil";
  if (score >= 30) return "Difícil";
  return "Muy difícil";
}

export function scoreSpanish(text: string): ScoreResult {
  const stats = basicStats(text, "es");
  const fh = fernandezHuerta(stats.avgSentenceLength, stats.avgSyllablesPerWord);
  const sz = szigriszt(stats.avgSentenceLength, stats.avgSyllablesPerWord);
  return {
    language: "es",
    interpretation: interpret(fh),
    metrics: {
      fernandez_huerta: round(fh),
      szigriszt_pazos: round(sz),
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
