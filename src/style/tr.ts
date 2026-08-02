import { splitSentences, splitWords, foldCase } from "../text.js";

/**
 * A register profile for Turkish, not a score. Style has no universal optimum —
 * a statute is supposed to be nominal and impersonal, marketing copy is not — so
 * the useful output is where a text sits relative to registers rather than a
 * verdict on it.
 *
 * Dimensions are here because they were measured to separate registers, not
 * because they sounded plausible. Seven candidates were tried against a
 * four-register Turkish corpus and five were dropped for barely moving between
 * registers: nominalisation (1.4x), light verbs (1.2x), participle load (1.2x),
 * connective variety (1.6x), passive voice (1.9x).
 *
 * The three modes of address came from Tutaş (2010) on advertising language and
 * are the strongest of the set — 12.7x, 16.1x and 4.9x — which is a good reason
 * to take candidates from the literature rather than from intuition.
 */

const WORD = /[a-zçğıöşüA-ZÇĞİÖŞÜ]+/g;

/** Second person: the pronoun and the -sInIz / -InIz endings that carry it. */
const SECOND_PERSON =
  /(?<![\p{L}])(?:siz|sizin|size|sizi|sizden|sizce)(?![\p{L}])|[\p{L}]{3,}(?:sınız|siniz|sunuz|sünüz|ınız|iniz|unuz|ünüz)(?![\p{L}])/giu;

/** First person plural: the pronoun, the verb endings, and the -ImIz possessive. */
const FIRST_PLURAL =
  /(?<![\p{L}])(?:biz|bizim|bize|bizi|bizden|bizce)(?![\p{L}])|[\p{L}]{3,}(?:ıyoruz|iyoruz|uyoruz|üyoruz|arız|eriz|ırız|iriz|uruz|ürüz|acağız|eceğiz|dık|dik|duk|dük|ımız|imiz|umuz|ümüz)(?![\p{L}])/giu;

/** Direct calls to act, the imperative register of advertising copy. */
const IMPERATIVE =
  /(?<![\p{L}])(?:hemen|şimdi|hadi|haydi|gelin|keşfedin|deneyin|inceleyin|tıklayın|kaçırmayın|başlayın|katılın|alın|görün)(?![\p{L}])/giu;

/** Set phrases that pad without adding: the filler that separated registers. */
const FILLER =
  /(?<![\p{L}])(?:son derece|oldukça|bir hayli|büyük önem|aynı zamanda|bu bağlamda|söz konusu|bir şekilde|olarak karşımıza)(?![\p{L}])/giu;

export type Register = "edebiyat" | "haber" | "pazarlama" | "ansiklopedi";

/**
 * Mean value per register, measured over a four-register Turkish corpus
 * (56 literary, 60 news, 60 marketing, 42 encyclopedic documents of 200+ words).
 * The marketing sample is the thinnest and the one most worth widening.
 */
const NORMS: Record<string, Record<Register, number>> = {
  ikinci_kisi_hitabi: { edebiyat: 3.64, haber: 2.21, pazarlama: 6.31, ansiklopedi: 0.5 },
  birinci_cogul: { edebiyat: 5.76, haber: 4.6, pazarlama: 3.43, ansiklopedi: 0.36 },
  emir_cagri: { edebiyat: 1.45, haber: 0.61, pazarlama: 1.18, ansiklopedi: 0.29 },
  dolgu_ifade: { edebiyat: 1.72, haber: 0.51, pazarlama: 1.91, ansiklopedi: 1.34 },
  cumle_basi_tekrari: { edebiyat: 2.09, haber: 4.78, pazarlama: 6.6, ansiklopedi: 7.05 },
  ortalama_cumle_uzunlugu: { edebiyat: 16.37, haber: 14.35, pazarlama: 12.79, ansiklopedi: 10.29 },
  ritim_degiskenligi: { edebiyat: 0.56, haber: 0.64, pazarlama: 0.61, ansiklopedi: 0.74 },
};

const REGISTERS: Register[] = ["edebiyat", "haber", "pazarlama", "ansiklopedi"];

export interface StyleDimension {
  value: number;
  norms: Record<Register, number>;
  closest: Register;
  /** Signed distance from the requested target, when one was given. */
  deviation?: number;
}

export interface StyleProfile {
  language: "tr";
  target?: Register;
  closest_register: Register;
  dimensions: Record<string, StyleDimension>;
  notes: string[];
  stats: { sentences: number; words: number };
}

const per1k = (text: string, re: RegExp, words: number) =>
  Math.round(((1000 * (text.match(re) ?? []).length) / Math.max(words, 1)) * 100) / 100;

function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export function styleProfileTurkish(text: string, target?: Register): StyleProfile {
  const folded = foldCase(text, "tr");
  const sentences = splitSentences(text);
  const words = (folded.match(WORD) ?? []).length;

  const usable = sentences.filter((s) => splitWords(s).length >= 3);
  const lengths = usable.map((s) => splitWords(s).length);
  const openings = usable.map((s) => (splitWords(s)[0] ?? "").toLocaleLowerCase("tr"));
  let repeated = 0;
  for (let i = 1; i < openings.length; i++) {
    if (openings[i] && openings[i] === openings[i - 1]) repeated++;
  }
  const avgLength = mean(lengths);
  const sd = lengths.length > 1
    ? Math.sqrt(mean(lengths.map((l) => (l - avgLength) ** 2)))
    : 0;

  const raw: Record<string, number> = {
    ikinci_kisi_hitabi: per1k(folded, SECOND_PERSON, words),
    birinci_cogul: per1k(folded, FIRST_PLURAL, words),
    emir_cagri: per1k(folded, IMPERATIVE, words),
    dolgu_ifade: per1k(folded, FILLER, words),
    cumle_basi_tekrari: Math.round((100 * repeated) / Math.max(openings.length - 1, 1) * 100) / 100,
    ortalama_cumle_uzunlugu: Math.round(avgLength * 100) / 100,
    ritim_degiskenligi: Math.round((avgLength ? sd / avgLength : 0) * 1000) / 1000,
  };

  const dimensions: Record<string, StyleDimension> = {};
  const votes: Record<Register, number> = { edebiyat: 0, haber: 0, pazarlama: 0, ansiklopedi: 0 };
  for (const [name, value] of Object.entries(raw)) {
    const norms = NORMS[name]!;
    let closest: Register = REGISTERS[0]!;
    let best = Infinity;
    for (const r of REGISTERS) {
      // Relative distance, so a dimension measured in tens does not outvote one
      // measured in fractions.
      const d = Math.abs(value - norms[r]) / Math.max(norms[r], 0.01);
      if (d < best) {
        best = d;
        closest = r;
      }
    }
    votes[closest]++;
    dimensions[name] = {
      value,
      norms,
      closest,
      ...(target ? { deviation: Math.round((value - norms[target]) * 100) / 100 } : {}),
    };
  }

  let closest_register: Register = REGISTERS[0]!;
  for (const r of REGISTERS) if (votes[r] > votes[closest_register]) closest_register = r;

  const notes: string[] = [];
  if (words < 150) notes.push("Metin kısa; profil değerleri oynak olabilir.");
  if (target) {
    const far = Object.entries(dimensions)
      .filter(([name, d]) => Math.abs(d.deviation ?? 0) / Math.max(NORMS[name]![target], 0.01) > 1)
      .map(([name]) => name);
    if (far.length) notes.push(`"${target}" hedefinden en çok sapan boyutlar: ${far.join(", ")}.`);
  }

  return {
    language: "tr",
    ...(target ? { target } : {}),
    closest_register,
    dimensions,
    notes,
    stats: { sentences: sentences.length, words },
  };
}
