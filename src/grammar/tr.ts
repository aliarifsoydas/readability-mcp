import { splitSentences, foldCase } from "../text.js";
import { TR_LEXICON } from "./tr-lexicon.generated.js";

/**
 * Turkish orthography checks, measured against the 42,449 attested sentences in
 * the TDK dictionary's example corpus — text that is correct by definition, so
 * anything a rule fires on there is a false positive. Only rules that stayed
 * under 0.5% are here.
 *
 *   kesme tutarlılığı   0.08%   shipped
 *   bağlaç ki bitişik   0.23%   shipped
 *   ek uyumu ihlali     0.41%   shipped
 *   soru eki bitişik    0.66%   NOT shipped
 *   bağlaç da/de        6.43%   NOT shipped
 *
 * The question-particle rule missed the 0.5% bar even with a possessive guard —
 * "kendimi" and "fikrimi" are accusatives, not questions — and separating them
 * needs to know the stem is a verb, which a lemma list cannot say. The da/de
 * rule is the famous one and it is deliberately absent. "okulda" as a
 * locative is correct and "okul da" as a conjunction is correct, and nothing in
 * the morphology distinguishes them — only what the sentence means does. A
 * lexicon cannot settle it, so it belongs to a semantic tier rather than here.
 */

const BACK = new Set("aıou");
const FRONT = new Set("eiöü");
const WORD = /[\p{L}]+/gu;

/**
 * "-ki" is the relative suffix, correctly joined, when it follows a locative
 * ("oradaki", "masadaki") or one of these time words ("yarınki", "zamanki").
 * Only outside those is a joined "ki" likely to be the conjunction.
 */
const RELATIVE_KI_STEM = /(?:d[ae]|t[ae])$/;
const TIME_WORDS = new Set([
  "zaman", "yarın", "dün", "bugün", "akşam", "sabah", "gece", "gündüz",
  "sonra", "önce", "şimdi", "geçen", "öte", "beri", "az", "bura", "şura", "ora",
]);

/** Suffixes whose vowel has to agree with the last vowel of the stem. */
const HARMONY_SUFFIXES: ReadonlyArray<readonly [string, "back" | "front"]> = [
  ["lar", "back"], ["ler", "front"],
  ["dan", "back"], ["den", "front"],
  ["tan", "back"], ["ten", "front"],
  ["lık", "back"], ["lik", "front"],
  ["sız", "back"], ["siz", "front"],
];

export interface GrammarFinding {
  rule: string;
  severity: "low" | "medium" | "high";
  message: string;
  sentence: number;
  excerpt: string;
  suggestion?: string;
}

export interface GrammarResult {
  language: "tr";
  findings: GrammarFinding[];
  findings_per_sentence: number;
  score_100: number;
  lexicon_available: boolean;
  checked_rules: string[];
  skipped_rules: string[];
  stats: { sentences: number; words: number };
}

const inLexicon = (w: string) => TR_LEXICON.has(w);

function lastVowel(word: string): string | undefined {
  for (let i = word.length - 1; i >= 0; i--) {
    const c = word[i]!;
    if (BACK.has(c) || FRONT.has(c)) return c;
  }
  return undefined;
}

/**
 * Split a word into stem + trailing particle, but only when the split is the
 * best available reading: the whole word must not be a word in its own right
 * ("sanki", "belki", "yirmi"), and no longer stem may be one either ("durum"
 * exists, so "durumu" is durum+u rather than duru+mu).
 */
function splitParticle(word: string, particle: RegExp): string | undefined {
  const m = word.match(particle);
  if (!m) return undefined;
  const stem = word.slice(0, word.length - m[0].length);
  if (stem.length < 2) return undefined;
  if (inLexicon(word)) return undefined;
  for (let k = 1; k <= 2; k++) {
    const longer = word.slice(0, stem.length + k);
    if (longer !== stem && inLexicon(longer)) return undefined;
  }
  return inLexicon(stem) ? stem : undefined;
}

export function checkTurkish(text: string): GrammarResult {
  const findings: GrammarFinding[] = [];
  const sentences = splitSentences(text);
  const hasLexicon = TR_LEXICON.size > 0;
  let words = 0;

  // The apostrophe check looks at the document as a whole; mixing the straight
  // and the typographic character is what makes it a finding, not either alone.
  const straight = (text.match(/'/g) ?? []).length;
  const curly = (text.match(/’/g) ?? []).length;
  if (straight > 0 && curly > 0) {
    findings.push({
      rule: "kesme_isareti_tutarsiz",
      severity: "low",
      message: `Kesme işareti tutarsız: ${straight} düz (') ve ${curly} kıvrık (’) kullanılmış. Metin boyunca tek karakter kullanın.`,
      sentence: -1,
      excerpt: "",
      suggestion: "Tümünü düz kesme işaretine (') çevirin.",
    });
  }

  sentences.forEach((sentence, index) => {
    const folded = foldCase(sentence, "tr");
    const tokens = folded.match(WORD) ?? [];
    words += tokens.length;
    if (!hasLexicon) return;

    for (const token of tokens) {
      // Suffix vowel harmony. Loanword stems break harmony inside the word but
      // their suffixes still agree with the final vowel, so only the boundary
      // is checked.
      for (const [suffix, klass] of HARMONY_SUFFIXES) {
        // Anchored at the end of the word on purpose. Letting the suffix sit
        // mid-word to catch "defter+ler+i" was measured and rejected: it took
        // the false-positive rate on attested Turkish from 0.41% to 2.34%.
        // The cost is recall — an error is only caught when the harmony suffix
        // is the last one on the word.
        if (token.length <= suffix.length + 2 || !token.endsWith(suffix)) continue;
        const stem = token.slice(0, token.length - suffix.length);
        if (!inLexicon(stem)) break;
        const vowel = lastVowel(stem);
        if (!vowel) break;
        const stemIsBack = BACK.has(vowel);
        if ((stemIsBack && klass === "front") || (!stemIsBack && klass === "back")) {
          const pairIndex = HARMONY_SUFFIXES.findIndex(([s]) => s === suffix);
          const fixed = HARMONY_SUFFIXES[pairIndex % 2 === 0 ? pairIndex + 1 : pairIndex - 1];
          findings.push({
            rule: "ek_uyumu",
            severity: "high",
            message: `"${token}" ünlü uyumuna aykırı: "${stem}" kök ünlüsü ${stemIsBack ? "kalın" : "ince"}, ek ise ${klass === "back" ? "kalın" : "ince"}.`,
            sentence: index,
            excerpt: sentence.slice(0, 120),
            suggestion: fixed ? `"${stem}${fixed[0]}"` : undefined,
          });
        }
        break;
      }

      // Conjunction "ki" written joined to the previous word.
      const kiStem = splitParticle(token, /ki$/);
      if (kiStem && !RELATIVE_KI_STEM.test(kiStem) && !TIME_WORDS.has(kiStem)) {
        findings.push({
          rule: "baglac_ki_bitisik",
          severity: "medium",
          message: `"${token}" bitişik yazılmış. Bağlaç olan "ki" ayrı yazılır.`,
          sentence: index,
          excerpt: sentence.slice(0, 120),
          suggestion: `"${kiStem} ki"`,
        });
      }

    }
  });

  const perSentence = findings.length / Math.max(sentences.length, 1);
  return {
    language: "tr",
    findings,
    findings_per_sentence: Math.round(perSentence * 1000) / 1000,
    // One finding per twenty sentences already costs a fifth of the score.
    score_100: Math.round(Math.max(0, 100 - perSentence * 400) * 100) / 100,
    lexicon_available: hasLexicon,
    checked_rules: hasLexicon
      ? ["kesme_isareti_tutarsiz", "ek_uyumu", "baglac_ki_bitisik"]
      : ["kesme_isareti_tutarsiz"],
    skipped_rules: hasLexicon ? [] : ["ek_uyumu", "baglac_ki_bitisik"],
    stats: { sentences: sentences.length, words },
  };
}
