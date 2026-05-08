import { basicStats, splitWords, countSyllables, round } from "../text.js";
import type { RawScoreResult } from "./types.js";

function wienerSachtextformel(text: string): number {
  const words = splitWords(text);
  const sentences = text
    .split(/[.!?…]+(?:\s+|$)|[\n\r]+/u)
    .map((s) => s.trim())
    .filter(Boolean);
  const w = words.length || 1;
  const s = sentences.length || 1;
  const ms = (words.filter((x) => countSyllables(x, "de") >= 3).length / w) * 100;
  const sl = w / s;
  const iw = (words.filter((x) => x.length >= 7).length / w) * 100;
  const es = (words.filter((x) => countSyllables(x, "de") === 1).length / w) * 100;
  return 0.1935 * ms + 0.1672 * sl + 0.1297 * iw - 0.0327 * es - 0.875;
}

function fleschDeutsch(asl: number, asw: number): number {
  return 180 - asl - 58.5 * asw;
}

function interpretFlesch(score: number): string {
  if (score >= 80) return "Sehr leicht";
  if (score >= 60) return "Leicht / Mittel";
  if (score >= 40) return "Anspruchsvoll";
  return "Schwer / Sehr schwer";
}

export function scoreGerman(text: string): RawScoreResult {
  const stats = basicStats(text, "de");
  const wstf = wienerSachtextformel(text);
  const flesch = fleschDeutsch(stats.avgSentenceLength, stats.avgSyllablesPerWord);
  return {
    language: "de",
    interpretation: `Flesch: ${interpretFlesch(flesch)} | WSTF Schulstufe: ${round(wstf)}`,
    metrics: {
      flesch_deutsch: round(flesch),
      wiener_sachtextformel: round(wstf),
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
