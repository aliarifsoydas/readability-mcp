import { basicStats, splitWords, countSyllables, round } from "../text.js";
import type { ScoreResult } from "./types.js";

function atesman(asl: number, asw: number): number {
  return 198.825 - 40.175 * asw - 2.61 * asl;
}

function bezirciYilmaz(text: string): number {
  const sentences = text
    .split(/[.!?…]+(?:\s+|$)|[\n\r]+/u)
    .map((s) => s.trim())
    .filter(Boolean);
  const words = splitWords(text);
  const s = sentences.length || 1;

  let h3 = 0;
  let h4 = 0;
  let h5 = 0;
  let h6plus = 0;
  for (const word of words) {
    const syl = countSyllables(word, "tr");
    if (syl === 3) h3++;
    else if (syl === 4) h4++;
    else if (syl === 5) h5++;
    else if (syl >= 6) h6plus++;
  }

  const oks = words.length / s;
  const avgH3 = h3 / s;
  const avgH4 = h4 / s;
  const avgH5 = h5 / s;
  const avgH6 = h6plus / s;
  return Math.sqrt(oks * (avgH3 * 0.84 + avgH4 * 1.5 + avgH5 * 3.5 + avgH6 * 26.35));
}

function cetinkayaUzun(asl: number, asw: number): number {
  return 118.823 - 25.987 * asw - 0.971 * asl;
}

function interpretAtesman(score: number): string {
  if (score >= 90) return "Çok kolay (ilkokul)";
  if (score >= 70) return "Kolay (ortaokul)";
  if (score >= 50) return "Orta (lise)";
  if (score >= 30) return "Zor (üniversite)";
  return "Çok zor (akademik)";
}

function interpretBezirci(yod: number): string {
  if (yod <= 8) return "İlköğretim seviyesi";
  if (yod <= 12) return "Lise seviyesi";
  if (yod <= 16) return "Lisans seviyesi";
  return "Akademik seviye";
}

function interpretCetinkaya(score: number): string {
  if (score >= 51) return "Bağımsız okuma düzeyi (5-7. sınıf)";
  if (score >= 35) return "Eğitsel okuma düzeyi (8-9. sınıf)";
  return "Yetersiz okuma düzeyi (10-12. sınıf)";
}

export function scoreTurkish(text: string): ScoreResult {
  const stats = basicStats(text, "tr");
  const at = atesman(stats.avgSentenceLength, stats.avgSyllablesPerWord);
  const bz = bezirciYilmaz(text);
  const cu = cetinkayaUzun(stats.avgSentenceLength, stats.avgSyllablesPerWord);

  return {
    language: "tr",
    interpretation: `Ateşman: ${interpretAtesman(at)} | Bezirci-Yılmaz: ${interpretBezirci(bz)} | Çetinkaya-Uzun: ${interpretCetinkaya(cu)}`,
    metrics: {
      atesman: round(at),
      bezirci_yilmaz: round(bz),
      cetinkaya_uzun: round(cu),
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
