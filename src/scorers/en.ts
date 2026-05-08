import { basicStats, splitWords, countSyllables, round } from "../text.js";
import type { RawScoreResult } from "./types.js";

function fleschReadingEase(asl: number, asw: number): number {
  return 206.835 - 1.015 * asl - 84.6 * asw;
}

function fleschKincaidGrade(asl: number, asw: number): number {
  return 0.39 * asl + 11.8 * asw - 15.59;
}

function gunningFog(words: string[], sentences: number): number {
  const w = words.length || 1;
  const complex = words.filter((x) => countSyllables(x, "en") >= 3).length;
  return 0.4 * (w / (sentences || 1) + 100 * (complex / w));
}

function smogIndex(words: string[], sentences: number): number {
  if (sentences < 3) return 0;
  const polysyllables = words.filter((x) => countSyllables(x, "en") >= 3).length;
  return 1.043 * Math.sqrt(polysyllables * (30 / sentences)) + 3.1291;
}

function colemanLiau(letters: number, words: number, sentences: number): number {
  const w = words || 1;
  const L = (letters / w) * 100;
  const S = (sentences / w) * 100;
  return 0.0588 * L - 0.296 * S - 15.8;
}

function ari(letters: number, words: number, sentences: number): number {
  const w = words || 1;
  const s = sentences || 1;
  return 4.71 * (letters / w) + 0.5 * (w / s) - 21.43;
}

function interpretFlesch(score: number): string {
  if (score >= 90) return "Very easy (5th grade)";
  if (score >= 80) return "Easy (6th grade)";
  if (score >= 70) return "Fairly easy (7th grade)";
  if (score >= 60) return "Plain English (8th-9th grade)";
  if (score >= 50) return "Fairly difficult (10th-12th grade)";
  if (score >= 30) return "Difficult (college)";
  return "Very difficult (college graduate)";
}

export function scoreEnglish(text: string): RawScoreResult {
  const stats = basicStats(text, "en");
  const words = splitWords(text);
  const flesch = fleschReadingEase(stats.avgSentenceLength, stats.avgSyllablesPerWord);
  const fkGrade = fleschKincaidGrade(stats.avgSentenceLength, stats.avgSyllablesPerWord);
  const fog = gunningFog(words, stats.sentences);
  const smog = smogIndex(words, stats.sentences);
  const cli = colemanLiau(stats.characters, stats.words, stats.sentences);
  const ariScore = ari(stats.characters, stats.words, stats.sentences);

  return {
    language: "en",
    interpretation: interpretFlesch(flesch),
    metrics: {
      flesch_reading_ease: round(flesch),
      flesch_kincaid_grade: round(fkGrade),
      gunning_fog: round(fog),
      smog_index: round(smog),
      coleman_liau_index: round(cli),
      automated_readability_index: round(ariScore),
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
