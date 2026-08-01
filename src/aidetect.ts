import { splitSentences, splitWords, foldCase, type SupportedLanguage } from "./text.js";
import { detectLanguage } from "./scorers/index.js";
import { llmPanel, modelsForTier, type PanelResult, type PanelTier } from "./llm_panel.js";

const AI_PHRASES: Record<SupportedLanguage, string[]> = {
  en: [
    "delve into", "delves into", "delving into", "let us delve", "let's delve", "delved into",
    "tapestry of", "rich tapestry",
    "navigate the landscape", "navigating the landscape", "navigate the complexities",
    "navigating the complexities",
    "it's worth noting", "it is worth noting", "it should be noted", "it's worth mentioning",
    "it's important to note", "it is important to note",
    "it's important to remember", "it is important to remember",
    "stand as a testament", "stands as a testament",
    "embark on a", "embark on a journey", "embarking on",
    "uncharted territory", "uncharted waters",
    "ever-evolving", "ever-changing world", "ever-changing landscape",
    "in today's fast-paced", "in today's digital age", "in the digital age",
    "in today's world", "in today's competitive",
    "harness the power", "harness the potential", "leverage the power",
    "unleash the potential", "unleash the power", "unlock the potential", "unlock the power",
    "play a pivotal role", "plays a pivotal role", "pivotal role",
    "plays a crucial role", "play a crucial role", "plays a vital role",
    "the intricacies of", "intricate details", "multifaceted",
    "seamlessly integrate", "seamlessly integrates", "seamless integration",
    "holistic approach", "comprehensive understanding",
    "foster a sense", "foster an environment",
    "cannot be overstated",
    "a testament to", "a beacon of", "shed light on",
    "lies at the heart of", "sits at the heart of",
    "in this article, we will", "in this article, we'll",
    "in this guide, we will", "in this guide, we'll", "in this post, we'll",
    "we'll walk you through",
    "by the end of this", "by the end of this article", "let's dive into",
  ],
  tr: [
    "günümüz dünyasında", "günümüz teknoloji çağında", "günümüz koşullarında",
    "hiç şüphesiz", "hiç kuşkusuz",
    "belirtmek gerekir ki", "belirtmek gerekir", "ifade etmek gerekir",
    "önemli bir rol oynamaktadır", "kritik bir rol oynar", "kritik bir rol oynamaktadır",
    "hayati bir öneme sahiptir", "büyük önem taşımaktadır", "büyük önem arz etmektedir",
    "göz ardı edilemez", "göz ardı edilmemelidir",
    "ele alınması gereken", "ele almak gerekirse",
    "dikkat çekici bir şekilde",
    "hızla değişen", "hızla gelişen", "sürekli evrilen", "sürekli değişen",
    "bütünsel bir yaklaşım", "kapsamlı bir bakış",
    "ön plana çıkmaktadır", "bir adım öne çıkar",
    "özetle", "netice itibarıyla",
    "vurgulamak gerekir", "altını çizmek gerekir",
    "özetlemek gerekirse", "toparlamak gerekirse",
    "bu makalede", "bu makalemizde", "bu yazıda", "bu yazımızda", "bu rehberde",
    "atılan adımlar", "atılması gereken adımlar",
  ],
  ru: [
    "в современном мире", "в современном обществе", "в сегодняшнем мире",
    "в эпоху цифровых технологий", "в постоянно меняющемся мире", "динамично развивающемся",
    "важно отметить", "стоит отметить", "следует отметить", "нельзя не отметить",
    "необходимо подчеркнуть", "стоит подчеркнуть",
    "играет ключевую роль", "играет важную роль", "играет решающую роль",
    "имеет огромное значение", "трудно переоценить", "невозможно переоценить",
    "является неотъемлемой частью", "неотъемлемой частью",
    "открывает новые возможности", "предоставляет уникальную возможность",
    "широкий спектр", "целый ряд преимуществ", "ключевым аспектом",
    "комплексный подход", "всесторонний анализ", "многогранный",
    "в конечном счёте", "в конечном счете", "в конечном итоге",
    "подводя итог", "в заключение", "таким образом, можно сказать",
    "давайте рассмотрим", "давайте разберёмся", "погрузиться в мир",
    "в этой статье мы", "в данной статье", "в этом руководстве",
    "стремительно развивается", "стремительно меняется",
    "эффективно и результативно", "качественно новый уровень",
    "на сегодняшний день", "в наши дни", "мир не стоит на месте",
    "стоит обратить внимание", "следует учитывать", "нельзя недооценивать",
    "занимает особое место", "имеет ряд преимуществ", "целый ряд факторов",
    "позволяет значительно", "существенно повышает", "не секрет, что",
    "идти в ногу со временем", "залогом успеха", "ключом к успеху",
    "индивидуальный подход", "высококвалифицированные специалисты",
    "оптимальное решение", "грамотный подход",
  ],
  es: [],
  de: [],
  fr: [],
  it: [],
};

const FRAGMENT_STARTERS: Record<SupportedLanguage, RegExp> = {
  en: /^(the|a|an|our|your|their|this|that|those|these|every|each|all|some|any|no)\b/i,
  // `\b` is ASCII-only, so after a final `ı`/`ç` it fired only when the NEXT
  // character was an ASCII letter — inverting `bazı` and `hiç` and shadowing
  // `tümü` behind `tüm`. The lookahead is the working equivalent.
  // Broadening this the way Russian was broadened does not transfer: Turkish
  // nominal sentences take no overt copula ("Hava güzel."), and the verb hint
  // only knows suffixed forms, so accepting any capitalised opener produced a
  // 25.6% false-positive rate on human Turkish (49% on Wikipedia). Noun-phrase
  // bullet fragments therefore stay uncovered here until there is a real
  // predicate detector for Turkish.
  tr: /^(?:bu|şu|o|her|tüm|tümü|bir|bazı|hiç|kimi|en)(?![\p{L}])/iu,
  es: /^(el|la|los|las|un|una|unos|unas|este|esta|esos|esas)\b/i,
  de: /^(der|die|das|den|dem|ein|eine|einen|jeder|alle)\b/i,
  fr: /^(le|la|les|un|une|des|ce|cette|ces|chaque|tous)\b/i,
  it: /^(il|la|lo|gli|le|un|una|uno|questo|questa|ogni|tutti)\b/i,
  // Russian has no articles, so the determiner test the other languages use has
  // nothing to key on, and LLM bullet fragments here are plain noun phrases
  // ("Экономия времени.", "Доступ к рынку.") that no suffix list covers.
  // Any opening is therefore a candidate and SENTENCE_VERB_HINT does the work —
  // except personal pronouns, which introduce the zero-copula sentences
  // ("Он врач.") that must not count as fragments.
  // The capital is load-bearing: abbreviations ("лезг.", "совр.") make the
  // sentence splitter cut mid-clause, and the lowercase debris that produces
  // would otherwise read as a fragment run.
  // `\b` is ASCII-only in JS and never fires between Cyrillic letters, so the
  // lookaheads below are the working equivalent.
  ru: /^(?!(?:[Оо]н|[Оо]на|[Оо]но|[Оо]ни|[Яя]|[Тт]ы|[Мм]ы|[Вв]ы)(?![\p{L}]))\p{Lu}/u,
};

const SENTENCE_VERB_HINT: Record<SupportedLanguage, RegExp> = {
  en: /\b(is|are|was|were|be|been|being|am|has|have|had|do|does|did|will|would|can|could|should|may|might|must|shall|let|gets|got|goes|went|comes|came|sees|saw|knows|knew|thinks|thought|says|said|tells|told|makes|made|takes|took)\b/i,
  // `\w+` admits only ASCII, so a stem ending in ı/ü/ş/ğ/ö/ç ("çalışıyor",
  // "değişmiştir", "güçlüdür") never reached its own suffix and the sentence
  // read as verbless. The lookbehind also keeps matching linear.
  tr: /(?<![\p{L}])[\p{L}]+(?:yor(?:um|sun|uz|sunuz|lar)?|miş(?:tir|ler)?|mış(?:tır|lar)?|muş(?:tur|lar)?|müş(?:tür|ler)?|acak(?:tır|lar)?|ecek(?:tir|ler)?|[dt][ıiuü]r)(?![\p{L}])/iu,
  es: /\b(es|son|era|fue|fueron|ha|han|había|hay|está|están|tiene|tienen)\b/i,
  de: /\b(ist|sind|war|waren|hat|haben|hatte|wird|werden|wurde|kann|muss|soll|darf)\b/i,
  fr: /\b(est|sont|était|étaient|a|ont|avait|sera|seront|peut|doit|peuvent|doivent)\b/i,
  it: /\b(è|sono|era|erano|ha|hanno|aveva|sarà|saranno|può|deve|possono|devono)\b/i,
  // Russian drops the present-tense copula ("Он врач." is a full sentence), so
  // a missing verb alone does not make a fragment. Predicatives and the dash
  // that stands in for the copula therefore count as a predicate too.
  // The lookbehind before the suffix branch is load-bearing: without it every
  // offset inside a letter run is a candidate start, `[\p{L}]{2,}` eats the run
  // and backtracks, and matching goes quadratic — a 64 KB word of Cyrillic took
  // 52 seconds, which is an easy way to burn a Worker's CPU budget.
  ru: /(?:^|[^\p{L}])(?:был|была|было|были|будет|будут|буду|есть|нет|можно|нужно|надо|важно|нельзя|необходимо|очевидно|понятно|ясно|должен|должна|должно|должны|может|могут)(?![\p{L}])|(?<![\p{L}])[\p{L}]{2,}(?:ет|ёт|ит|ут|ют|ат|ят|ем|ём|им|ешь|ёшь|ишь|ете|ите|[аеиоуыя]л[аои]?|ться|тся|[аяеиыу]ть|ся|сь)(?![\p{L}])|\s—\s/iu,
};

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

function isFragment(sentence: string, lang: SupportedLanguage): boolean {
  const words = splitWords(sentence);
  if (words.length < 2 || words.length > 8) return false;
  const startsWithDeterminer = FRAGMENT_STARTERS[lang].test(sentence.trim());
  // Folded for the verb test only: the Russian starter leans on \p{Lu}, but the
  // verb hints are case-insensitive and Turkish needs locale-aware folding.
  const hasVerb = SENTENCE_VERB_HINT[lang].test(foldCase(sentence, lang));
  return startsWithDeterminer && !hasVerb;
}

function mean(xs: number[]): number {
  if (!xs.length) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) ** 2;
  return Math.sqrt(s / xs.length);
}

interface Reason {
  code: string;
  severity: "low" | "medium" | "high";
  explanation: string;
  location?: { paragraph?: number; sentences?: number[] };
  evidence?: unknown;
}

interface SentenceFlag {
  idx: number;
  text: string;
  word_count: number;
  flags: string[];
}

interface BurstinessSignal {
  score: number;
  cv: number;
  mean_sentence_length: number;
  reason?: Reason;
}

function burstinessSignal(sentences: string[]): BurstinessSignal {
  // Drop heading-like ultra-short "sentences" (1-2 words) — they pollute CV
  const lengths = sentences.map((s) => splitWords(s).length).filter((n) => n >= 3);
  if (lengths.length === 0) {
    // Nothing to measure: stay at 0 rather than the neutral 50, which otherwise
    // gives empty or punctuation-only input a nonzero AI score.
    return { score: 0, cv: 0, mean_sentence_length: 0 };
  }
  if (lengths.length < 3) {
    return { score: 50, cv: 0, mean_sentence_length: Math.round(mean(lengths) * 100) / 100 };
  }
  const m = mean(lengths);
  const cv = stdev(lengths) / (m || 1);
  const HUMAN_OPT = 0.55;
  const HUMAN_LOW = 0.35;
  const score = cv < HUMAN_LOW
    ? Math.min(100, ((HUMAN_LOW - cv) / HUMAN_LOW) * 100)
    : cv > 0.9
      ? Math.min(100, ((cv - 0.9) / 0.5) * 60)
      : 0;
  let reason: Reason | undefined;
  if (cv < HUMAN_LOW) {
    reason = {
      code: "low_burstiness",
      severity: cv < 0.2 ? "high" : "medium",
      explanation: `Cümle uzunluk varyansı çok düşük (CV=${cv.toFixed(2)}). İnsan metinlerinde 0.4-0.7 beklenir; AI metinleri tekdüze ritim üretme eğilimindedir.`,
      evidence: { cv: Math.round(cv * 1000) / 1000, mean_length: Math.round(m * 100) / 100 },
    };
  }
  return { score: Math.round(score * 100) / 100, cv: Math.round(cv * 1000) / 1000, mean_sentence_length: Math.round(m * 100) / 100, reason };
}

interface AiPhraseSignal {
  score: number;
  hits: { phrase: string; count: number }[];
  total: number;
  reason?: Reason;
}

function aiPhraseSignal(text: string, lang: SupportedLanguage, sentenceCount: number): AiPhraseSignal {
  const phrases = AI_PHRASES[lang];
  if (!phrases.length) return { score: 0, hits: [], total: 0 };
  // Both apostrophes are one UTF-16 unit, so the claim mask stays aligned.
  const lower = foldCase(text, lang).replace(/[\u2019\u02BC]/g, "'");
  const claimed = new Uint8Array(lower.length);
  const hits: { phrase: string; count: number }[] = [];
  let total = 0;
  // Longest first, and every match claims its span: several entries in these
  // lists nest inside one another ("tapestry" in "rich tapestry", "pivotal
  // role" in "plays a pivotal role"), and counting each of them separately
  // would score a single occurrence two or three times over.
  for (const phrase of [...phrases].sort((a, b) => b.length - a.length)) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(?:^|[^\\p{L}])(${escaped})(?:[^\\p{L}]|$)`, "gu");
    let count = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(lower)) !== null) {
      const start = m.index + (m[0].startsWith(m[1]!) ? 0 : 1);
      const end = start + m[1]!.length;
      re.lastIndex = end;
      let free = true;
      for (let i = start; i < end; i++) {
        if (claimed[i]) {
          free = false;
          break;
        }
      }
      if (!free) continue;
      claimed.fill(1, start, end);
      count++;
    }
    if (count > 0) {
      hits.push({ phrase, count });
      total += count;
    }
  }
  hits.sort((a, b) => b.count - a.count);
  const density = total / Math.max(1, sentenceCount);
  const score = Math.min(100, density * 200);
  let reason: Reason | undefined;
  if (total >= 2 || density > 0.05) {
    reason = {
      code: "ai_phrase_cluster",
      severity: total >= 5 ? "high" : "medium",
      explanation: `${total} adet yüksek-frekanslı LLM kalıbı bulundu (cümle başına ${density.toFixed(3)}). Bu kelimeler gerçek dedektörlerin sözlüklerinde flag'li.`,
      evidence: { top: hits.slice(0, 8) },
    };
  }
  return { score: Math.round(score * 100) / 100, hits, total, reason };
}

interface FragmentListSignal {
  score: number;
  occurrences: { paragraph: number; consecutive_count: number; example: string }[];
  reason?: Reason;
}

function fragmentListSignal(paragraphs: string[], lang: SupportedLanguage): FragmentListSignal {
  const occurrences: { paragraph: number; consecutive_count: number; example: string }[] = [];
  paragraphs.forEach((para, idx) => {
    const sentences = splitSentences(para);
    let run = 0;
    let maxRun = 0;
    let exampleStart = -1;
    let exampleStartCandidate = -1;
    sentences.forEach((s, i) => {
      if (isFragment(s, lang)) {
        if (run === 0) exampleStartCandidate = i;
        run++;
        if (run > maxRun) {
          maxRun = run;
          exampleStart = exampleStartCandidate;
        }
      } else {
        run = 0;
      }
    });
    if (maxRun >= 3) {
      const example = sentences.slice(exampleStart, exampleStart + maxRun).join(" ");
      occurrences.push({ paragraph: idx, consecutive_count: maxRun, example: example.slice(0, 200) });
    }
  });
  const score = occurrences.length === 0 ? 0 : Math.min(100, occurrences.reduce((s, o) => s + o.consecutive_count * 15, 0));
  let reason: Reason | undefined;
  if (occurrences.length > 0) {
    reason = {
      code: "fragment_list_paragraph",
      severity: "high",
      explanation: `${occurrences.length} paragrafta ardışık fragman dizilimi tespit edildi ("X. Y. Z." kalıbı). Bu, LLM'in liste yapması gereken yerde fragmanlar üretmesinin klasik imzasıdır.`,
      evidence: occurrences,
      location: { paragraph: occurrences[0]!.paragraph },
    };
  }
  return { score: Math.round(score * 100) / 100, occurrences, reason };
}

interface ParallelStructureSignal {
  score: number;
  runs: { start_sentence: number; length: number; pattern: string }[];
  reason?: Reason;
}

function parallelStructureSignal(sentences: string[]): ParallelStructureSignal {
  const runs: { start_sentence: number; length: number; pattern: string }[] = [];
  if (sentences.length < 3) return { score: 0, runs: [] };
  const firstWords = sentences.map((s) => {
    const w = splitWords(s);
    return w[0]?.toLowerCase() ?? "";
  });
  const lengths = sentences.map((s) => splitWords(s).length);
  let runStart = 0;
  let runLen = 1;
  for (let i = 1; i < sentences.length; i++) {
    const fwCurr = firstWords[i] ?? "";
    const fwPrev = firstWords[i - 1] ?? "";
    const lenCurr = lengths[i] ?? 0;
    const lenPrev = lengths[i - 1] ?? 0;
    const sameStart = fwCurr.length > 0 && fwCurr === fwPrev;
    const closeLength = Math.abs(lenCurr - lenPrev) <= 2;
    if (sameStart || (closeLength && lenCurr >= 4 && lenCurr <= 12)) {
      runLen++;
    } else {
      if (runLen >= 3) {
        runs.push({ start_sentence: runStart, length: runLen, pattern: firstWords[runStart] ?? "" });
      }
      runStart = i;
      runLen = 1;
    }
  }
  if (runLen >= 3) runs.push({ start_sentence: runStart, length: runLen, pattern: firstWords[runStart] ?? "" });

  const score = runs.length === 0 ? 0 : Math.min(100, runs.reduce((s, r) => s + (r.length - 2) * 12, 0));
  let reason: Reason | undefined;
  if (runs.length > 0) {
    const longest = runs.reduce((a, b) => (a.length > b.length ? a : b));
    reason = {
      code: "parallel_structure_run",
      severity: longest.length >= 5 ? "high" : "medium",
      explanation: `Ardışık ${longest.length} cümle benzer yapıda (aynı kelimeyle başlama veya uzunluk). İnsan yazımında doğal kırılmalar olur.`,
      evidence: runs,
      location: { sentences: Array.from({ length: longest.length }, (_, i) => longest.start_sentence + i) },
    };
  }
  return { score: Math.round(score * 100) / 100, runs, reason };
}

interface EmDashSignal {
  score: number;
  count: number;
  density_per_sentence: number;
  reason?: Reason;
}

/**
 * Russian writes the dash as a grammatical copula ("Москва — столица России")
 * and as the dialogue marker, so a density that signals LLM style elsewhere is
 * ordinary prose there and needs a much higher bar.
 */
const EM_DASH_LIMITS: Record<SupportedLanguage, { flagAt: number; scale: number }> = {
  en: { flagAt: 0.1, scale: 200 },
  tr: { flagAt: 0.1, scale: 200 },
  es: { flagAt: 0.1, scale: 200 },
  de: { flagAt: 0.1, scale: 200 },
  fr: { flagAt: 0.1, scale: 200 },
  it: { flagAt: 0.1, scale: 200 },
  ru: { flagAt: 0.5, scale: 60 },
};

function emDashSignal(text: string, sentenceCount: number, lang: SupportedLanguage): EmDashSignal {
  const { flagAt, scale } = EM_DASH_LIMITS[lang];
  const count =
    (text.match(/—/g) ?? []).length +
    // U+2013 between digits is a numeric range, not a stylistic dash.
    (text.match(/(?<!\d)–(?!\d)/g) ?? []).length;
  const density = count / Math.max(1, sentenceCount);
  const score = Math.min(100, density * scale);
  let reason: Reason | undefined;
  if (density > flagAt) {
    reason = {
      code: "em_dash_overuse",
      severity: density > flagAt * 3 ? "high" : "medium",
      explanation: `Em-dash yoğunluğu yüksek (cümle başına ${density.toFixed(3)}). LLM'lerin imza noktalama tercihi.`,
      evidence: { count, density: Math.round(density * 1000) / 1000 },
    };
  }
  return { score: Math.round(score * 100) / 100, count, density_per_sentence: Math.round(density * 1000) / 1000, reason };
}

interface NotXButYSignal {
  score: number;
  count: number;
  multi_item_runs: number;
  reason?: Reason;
}

/**
 * The rhetorical antithesis LLMs lean on. One regex per language could not carry
 * it: the shape ranges from "not only X but also Y" to a bare "X değil, Y" to a
 * multi-item run ("not A, not B, not C — but D"), and the pivot is as often a
 * dash, colon or full stop as it is a conjunction. Each language therefore gets
 * an ordered list, most specific first, and matched spans are claimed so the
 * same clause is not counted twice.
 *
 * `\w` and `\b` are ASCII-only in JS, which used to make the Turkish pattern
 * inert the moment a ğ/ü/ş/ı/ö/ç fell between the two markers — i.e. nearly
 * always. Every class below is Unicode.
 */
const GAP = String.raw`[\p{L}\p{N}\s,;:'’\-–—()]`;

/** A subject plus its copula, e.g. "it's", "you're", "the problem is". */
const SUBJ = String.raw`(?:(?:the|a|an|this|that|our|your|their|his|her|its)\s+)?(?:\p{L}+['’](?:s|re|ll|ve)|\p{L}+\s+(?:is|are|was|were|will))`;

/** Marks a negated item, used to tell a two-part antithesis from a multi-item run. */
const NEGATION_TOKEN: Record<SupportedLanguage, RegExp> = {
  en: /(?<![\p{L}])(?:not|no|never|isn['’]t|aren['’]t|wasn['’]t|weren['’]t|don['’]t|doesn['’]t|didn['’]t)(?![\p{L}])/giu,
  tr: /(?<![\p{L}])(?:değil(?:dir)?|olmayıp|ne)(?![\p{L}])/giu,
  ru: /(?<![\p{L}])(?:не|ни)(?![\p{L}])/giu,
  es: /(?<![\p{L}])no(?![\p{L}])/giu,
  de: /(?<![\p{L}])nicht(?![\p{L}])/giu,
  fr: /(?<![\p{L}])(?:ne|non)(?![\p{L}])/giu,
  it: /(?<![\p{L}])non(?![\p{L}])/giu,
};

const NOT_X_BUT_Y: Record<SupportedLanguage, RegExp[]> = {
  en: [
    // multi-item: "Not a strategy, not a roadmap, not a plan — but a hunch."
    new RegExp(String.raw`(?<![\p{L}])not(?![\p{L}])${GAP}{1,60}?,\s*not(?![\p{L}])${GAP}{1,80}?(?:[—–:-]|,\s*but|\bbut)(?![\p{L}])`, "giu"),
    // "not only/just/merely X but (also) Y"
    new RegExp(String.raw`(?<![\p{L}])not\s+(?:just|only|merely|simply)(?![\p{L}])${GAP}{1,60}?(?<![\p{L}])but(?:\s+(?:also|rather))?(?![\p{L}])`, "giu"),
    // A negated frame, a pivot, then the frame echoed: "It's not X. It's Y.",
    // "The problem isn't X; the problem is Y.", "You're not X — you're Y."
    new RegExp(String.raw`(?<![\p{L}])${SUBJ}\s+(?:not|never)(?![\p{L}])${GAP}{1,55}?[.,;:—–]\s*${SUBJ}(?![\p{L}])`, "giu"),
    new RegExp(String.raw`(?<![\p{L}])\p{L}+\s*(?:isn|aren|wasn|weren)['’]t(?![\p{L}])${GAP}{1,55}?[.,;:—–]\s*${SUBJ}(?![\p{L}])`, "giu"),
    // "We don't need X. We need Y." / "We don't need X, we need Y."
    new RegExp(String.raw`(?<![\p{L}])(?:do|does|did)n['’]t\s+(\p{L}+)(?![\p{L}])${GAP}{1,60}?[.,;:—–]\s*\p{L}{1,12}\s+\1(?![\p{L}])`, "giu"),
    // bare "not a bug, but a feature" — the determiner is what separates
    // rhetorical antithesis from ordinary concession ("could not reproduce the
    // crash, but CI caught it"), where `not` negates a verb instead.
    new RegExp(String.raw`(?<![\p{L}])not\s+(?:a|an|the|one|any|some|all|every|my|our|your|their|his|her|its)(?![\p{L}])${GAP}{1,45}?(?<![\p{L}])but(?:\s+(?:also|rather))?(?![\p{L}])`, "giu"),
    // inverted appositive: "a beginning, not an end"
    new RegExp(String.raw`,\s*not\s+(?:a|an|the|just|only|merely|simply)(?![\p{L}])${GAP}{1,40}?[.!?]`, "giu"),
  ],
  tr: [
    // multi-item: "Ne kod, ne araç, ne süreç — mesele insan."
    new RegExp(String.raw`(?<![\p{L}])ne(?![\p{L}])${GAP}{1,50}?,\s*ne(?:\s+de)?(?![\p{L}])${GAP}{1,60}?[—–,.]`, "giu"),
    // "ne X ne de Y"
    new RegExp(String.raw`(?<![\p{L}])ne(?![\p{L}])${GAP}{1,50}?(?<![\p{L}])ne\s+de(?![\p{L}])`, "giu"),
    // "sadece/yalnızca X değil, aynı zamanda Y"
    new RegExp(String.raw`(?<![\p{L}])(?:sadece|yalnızca|salt)(?![\p{L}])${GAP}{1,60}?(?<![\p{L}])(?:değil(?:dir)?|olmayıp)(?![\p{L}])`, "giu"),
    // plain "X değil, Y" — the workhorse form, and the one that was fully inert
    new RegExp(String.raw`(?<![\p{L}])değil(?:dir|di)?(?![\p{L}])\s*[,;—–]\s*\p{L}${GAP}{0,60}?[.!?]`, "giu"),
    // "X değil. Y." across a sentence break
    new RegExp(String.raw`(?<![\p{L}])değil(?:dir|di)?(?![\p{L}])\s*\.\s*\p{Lu}${GAP}{0,60}?[.!?]`, "gu"),
  ],
  ru: [
    // multi-item: "Не в скорости, не в цене, не в масштабе — а в доверии."
    new RegExp(String.raw`(?<![\p{L}])(?:не|ни)(?![\p{L}])${GAP}{1,50}?,\s*(?:не|ни)(?![\p{L}])${GAP}{1,70}?[—–,]\s*а(?![\p{L}])`, "giu"),
    new RegExp(String.raw`(?<![\p{L}])ни(?![\p{L}])${GAP}{1,50}?,\s*ни(?![\p{L}])${GAP}{1,70}?[—–]`, "giu"),
    // "не только X, но и Y" / "не столько X, сколько Y"
    new RegExp(String.raw`(?<![\p{L}])не только(?![\p{L}])${GAP}{1,60}?(?<![\p{L}])но и(?![\p{L}])`, "giu"),
    new RegExp(String.raw`(?<![\p{L}])не столько(?![\p{L}])${GAP}{1,60}?(?<![\p{L}])сколько(?![\p{L}])`, "giu"),
    // "не X, а Y" — the dominant Russian antithesis, previously absent entirely
    new RegExp(String.raw`(?<![\p{L}])не(?![\p{L}])${GAP}{1,60}?[,—–]\s*а(?![\p{L}])`, "giu"),
    // "Это не X — это Y." / "Речь идёт не о X. Речь идёт о Y."
    new RegExp(String.raw`(?<![\p{L}])не(?![\p{L}])${GAP}{1,60}?[—–]\s*(?:это|он|она|оно|они)(?![\p{L}])`, "giu"),
  ],
  es: [
    new RegExp(String.raw`(?<![\p{L}])no\s+(?:solo|sólo|solamente)(?![\p{L}])${GAP}{1,60}?(?<![\p{L}])sino(?:\s+también)?(?![\p{L}])`, "giu"),
    new RegExp(String.raw`(?<![\p{L}])no(?![\p{L}])${GAP}{1,50}?(?<![\p{L}])sino(?![\p{L}])`, "giu"),
  ],
  de: [
    new RegExp(String.raw`(?<![\p{L}])nicht\s+nur(?![\p{L}])${GAP}{1,60}?(?<![\p{L}])sondern(?:\s+auch)?(?![\p{L}])`, "giu"),
    new RegExp(String.raw`(?<![\p{L}])nicht(?![\p{L}])${GAP}{1,50}?(?<![\p{L}])sondern(?![\p{L}])`, "giu"),
  ],
  fr: [
    new RegExp(String.raw`(?<![\p{L}])non\s+seulement(?![\p{L}])${GAP}{1,60}?(?<![\p{L}])mais(?:\s+(?:aussi|également))?(?![\p{L}])`, "giu"),
    new RegExp(String.raw`(?<![\p{L}])(?:ne|n['’])(?![\p{L}])${GAP}{1,50}?(?<![\p{L}])pas${GAP}{1,40}?(?<![\p{L}])mais(?![\p{L}])`, "giu"),
  ],
  it: [
    new RegExp(String.raw`(?<![\p{L}])non\s+solo(?![\p{L}])${GAP}{1,60}?(?<![\p{L}])ma(?:\s+anche)?(?![\p{L}])`, "giu"),
    new RegExp(String.raw`(?<![\p{L}])non(?![\p{L}])${GAP}{1,50}?(?<![\p{L}])ma(?:\s+anche)?(?![\p{L}])`, "giu"),
  ],
};


function notXButYSignal(text: string, lang: SupportedLanguage, sentenceCount: number): NotXButYSignal {
  const claimed = new Uint8Array(text.length);
  let count = 0;
  let multiItem = 0;
  // Patterns run most specific first and claim their span, so a clause that two
  // of them describe is counted once.
  for (const re of NOT_X_BUT_Y[lang]) {
    for (const m of text.matchAll(re)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      if (end <= start) continue;
      let free = true;
      for (let i = start; i < end; i++) {
        if (claimed[i]) {
          free = false;
          break;
        }
      }
      if (!free) continue;
      claimed.fill(1, start, end);
      count++;
      // "Not A, not B, not C — but D" is a stronger tell than a two-part
      // antithesis, so a run of negated items counts for more than one.
      const negations = (m[0].match(NEGATION_TOKEN[lang]) ?? []).length;
      if (negations >= 3) multiItem += 2;
      else if (negations === 2) multiItem += 1;
    }
  }
  const weighted = count + multiItem;
  const density = weighted / Math.max(1, sentenceCount);
  const score = Math.min(100, density * 400);
  let reason: Reason | undefined;
  // Gated on density, not raw count: a novel accumulates a dozen antitheses over
  // 100k words as a matter of course, while three in a 15-sentence article is the
  // tell. Measured human prose sits near 0.01 per sentence in every register.
  if (weighted >= 2 && density >= 0.05) {
    reason = {
      code: "not_x_but_y_pattern",
      severity: weighted >= 4 ? "high" : "medium",
      explanation: `"X değil Y" / "not just X but Y" retorik kalıbı ${count} kez kullanılmış${multiItem > 0 ? `, ${multiItem} tanesi çok öğeli dizi` : ""}. LLM'lerin sevdiği balanslı antitez yapısı; insan yazımında bu yoğunlukta nadir.`,
      evidence: { count, multi_item_runs: multiItem },
    };
  }
  return { score: Math.round(score * 100) / 100, count, multi_item_runs: multiItem, reason };
}

export interface AiDetectResult {
  language: SupportedLanguage;
  composite_score: number;
  verdict: "likely_human" | "uncertain" | "likely_ai" | "very_likely_ai";
  heuristic_score: number;
  llm_score?: number;
  signals: {
    burstiness: BurstinessSignal;
    ai_phrases: AiPhraseSignal;
    fragment_lists: FragmentListSignal;
    parallel_structure: ParallelStructureSignal;
    em_dash: EmDashSignal;
    not_x_but_y: NotXButYSignal;
    llm_panel?: PanelResult;
  };
  reasons: Reason[];
  per_sentence: SentenceFlag[];
  summary_advice: string[];
  stats: {
    sentences: number;
    paragraphs: number;
    words: number;
  };
}

const ADVICE: Record<SupportedLanguage, Partial<Record<string, string>>> = {
  tr: {
    low_burstiness: "Cümle uzunluklarını çeşitlendir: 3-6 kelimelik kısa cümlelerle 18-25 kelimelik uzun cümleleri karıştır.",
    ai_phrase_cluster: "Tespit edilen yüksek-frekanslı LLM kalıplarını (yukarıdaki 'evidence.top') kaldır veya değiştir.",
    fragment_list_paragraph: "Ardışık fragman içeren paragrafı akıcı tek bir cümleye dönüştür ya da gerçek bir madde-işaretli liste yap.",
    parallel_structure_run: "Aynı yapıda ardışık cümle dizisini kır: aralara farklı uzunluk veya farklı bağlaçla başlayan bir cümle koy.",
    em_dash_overuse: "Em-dash (—) sayısını azalt; bunların yerine virgül, parantez veya iki ayrı cümle kullan.",
    not_x_but_y_pattern: "'X değil Y' / 'sadece X değil aynı zamanda Y' kalıbını sayıca azalt; doğal cümlelerle değiştir.",
  },
  en: {
    low_burstiness: "Vary sentence lengths: mix 3-6 word short sentences with 18-25 word long ones.",
    ai_phrase_cluster: "Remove or replace the detected high-frequency LLM phrases (see evidence.top).",
    fragment_list_paragraph: "Convert the consecutive fragment paragraph into either a single flowing sentence or a real bulleted list.",
    parallel_structure_run: "Break consecutive same-structured sentences: insert one with different length or different opening word.",
    em_dash_overuse: "Reduce em-dashes (—); replace with commas, parentheses, or two separate sentences.",
    not_x_but_y_pattern: "Reduce 'not X but Y' constructions; replace with natural phrasing.",
  },
  ru: {
    low_burstiness: "Разнообразьте длину предложений: чередуйте короткие (3-6 слов) и длинные (18-25 слов).",
    ai_phrase_cluster: "Уберите или замените найденные частотные штампы LLM (см. evidence.top).",
    fragment_list_paragraph: "Перепишите абзац из идущих подряд обрывков как связное предложение или оформите его настоящим списком.",
    parallel_structure_run: "Разбейте цепочку одинаково построенных предложений: вставьте предложение другой длины или с другим началом.",
    em_dash_overuse: "Сократите число длинных тире (—); замените их запятыми, скобками или двумя отдельными предложениями.",
    not_x_but_y_pattern: "Сократите конструкции «не только X, но и Y»; замените их естественными формулировками.",
  },
  es: {}, de: {}, fr: {}, it: {},
};

function buildPerSentence(
  sentences: string[],
  lang: SupportedLanguage,
  parallelRuns: ParallelStructureSignal["runs"],
  aiPhraseHits: AiPhraseSignal["hits"],
): SentenceFlag[] {
  const parallelIndices = new Set<number>();
  for (const r of parallelRuns) {
    for (let i = 0; i < r.length; i++) parallelIndices.add(r.start_sentence + i);
  }
  const phraseSet = new Set(aiPhraseHits.map((h) => h.phrase));
  const lengths = sentences.map((s) => splitWords(s).length);
  const m = mean(lengths);

  return sentences.map((s, idx) => {
    const flags: string[] = [];
    const lower = foldCase(s, lang).replace(/[\u2019\u02BC]/g, "'");
    for (const p of phraseSet) {
      // Boundary-checked like aiPhraseSignal, so a sentence flag never disagrees
      // with the score that produced it.
      const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(`(?:^|[^\\p{L}])${escaped}(?:[^\\p{L}]|$)`, "u").test(lower)) {
        flags.push("ai_phrase");
        break;
      }
    }
    if (isFragment(s, lang)) flags.push("fragment");
    if (parallelIndices.has(idx)) flags.push("parallel_run");
    const wc = lengths[idx] ?? 0;
    if (wc > 0 && Math.abs(wc - m) < 1.5 && lengths.length >= 5) {
      flags.push("monotone_length");
    }
    if (/—|–/.test(s)) flags.push("em_dash");

    return {
      idx,
      text: s.length > 200 ? s.slice(0, 200) + "…" : s,
      word_count: wc,
      flags,
    };
  });
}

function deriveVerdict(score: number, reasons: Reason[]): AiDetectResult["verdict"] {
  const high = reasons.filter((r) => r.severity === "high").length;
  const med = reasons.filter((r) => r.severity === "medium").length;
  if (score >= 75 || high >= 2) return "very_likely_ai";
  if (score >= 50 || high >= 1 || med >= 3) return "likely_ai";
  if (score >= 25 || med >= 1) return "uncertain";
  return "likely_human";
}

export interface AiDetectOptions {
  language?: SupportedLanguage | "auto";
  weights?: Partial<{
    burstiness: number;
    ai_phrases: number;
    fragment_lists: number;
    parallel_structure: number;
    em_dash: number;
    not_x_but_y: number;
  }>;
  llm?: {
    apiKey?: string;
    tier?: PanelTier;
    models?: string[];
    baseUrl?: string;
    weight?: number;
    timeoutMs?: number;
  };
}

const DEFAULT_WEIGHTS = {
  burstiness: 0.25,
  ai_phrases: 0.25,
  fragment_lists: 0.18,
  parallel_structure: 0.15,
  em_dash: 0.07,
  not_x_but_y: 0.10,
};

export async function aiDetectScore(text: string, opts: AiDetectOptions = {}): Promise<AiDetectResult> {
  const lang = opts.language && opts.language !== "auto" ? opts.language : detectLanguage(text);
  const sentences = splitSentences(text);
  const paragraphs = splitParagraphs(text);
  const words = splitWords(text);

  // Punctuation with no words carries no style to judge; scoring it would
  // produce a verdict about nothing.
  const scoreable = words.length > 0;

  const burstiness = burstinessSignal(sentences);
  const ai_phrases = aiPhraseSignal(text, lang, sentences.length);
  const fragment_lists = fragmentListSignal(paragraphs, lang);
  const parallel_structure = parallelStructureSignal(sentences);
  const em_dash = emDashSignal(text, sentences.length, lang);
  const not_x_but_y = notXButYSignal(text, lang, sentences.length);

  const w = { ...DEFAULT_WEIGHTS, ...(opts.weights ?? {}) };
  const total = w.burstiness + w.ai_phrases + w.fragment_lists + w.parallel_structure + w.em_dash + w.not_x_but_y;
  const heuristic_score =
    (burstiness.score * w.burstiness +
      ai_phrases.score * w.ai_phrases +
      fragment_lists.score * w.fragment_lists +
      parallel_structure.score * w.parallel_structure +
      em_dash.score * w.em_dash +
      not_x_but_y.score * w.not_x_but_y) / total;

  const reasons: Reason[] = [];
  if (!scoreable) {
    return {
      language: lang,
      heuristic_score: 0,
      composite_score: 0,
      verdict: "likely_human",
      signals: { burstiness, ai_phrases, fragment_lists, parallel_structure, em_dash, not_x_but_y },
      reasons,
      per_sentence: [],
      summary_advice: [],
      stats: { sentences: sentences.length, paragraphs: paragraphs.length, words: 0 },
    };
  }
  if (burstiness.reason) reasons.push(burstiness.reason);
  if (ai_phrases.reason) reasons.push(ai_phrases.reason);
  if (fragment_lists.reason) reasons.push(fragment_lists.reason);
  if (parallel_structure.reason) reasons.push(parallel_structure.reason);
  if (em_dash.reason) reasons.push(em_dash.reason);
  if (not_x_but_y.reason) reasons.push(not_x_but_y.reason);

  let panel: PanelResult | undefined;
  let llm_score: number | undefined;
  const wantsPanel = !!opts.llm?.apiKey && (opts.llm?.tier !== undefined || (opts.llm?.models && opts.llm.models.length > 0));
  if (wantsPanel && opts.llm?.apiKey) {
    const models = opts.llm.models && opts.llm.models.length > 0
      ? opts.llm.models
      : modelsForTier(opts.llm.tier ?? "premium");
    panel = await llmPanel(text, lang, {
      apiKey: opts.llm.apiKey,
      models,
      baseUrl: opts.llm.baseUrl,
      timeoutMs: opts.llm.timeoutMs,
    });
    if (panel.models_used.length > 0) {
      llm_score = panel.composite_score;
      for (const c of panel.consensus_reasons) {
        const dist = c.severity_distribution;
        const sev: "low" | "medium" | "high" = dist.high > 0 ? "high" : dist.medium > 0 ? "medium" : "low";
        reasons.push({
          code: `llm_consensus:${c.code}`,
          severity: sev,
          explanation: `${c.judges.length} judge consensus — ${c.representative_explanation}`,
          evidence: { judges: c.judges, quoted: c.quoted_evidence, severity_distribution: dist },
        });
      }
    }
  }

  const llmWeight = opts.llm?.weight ?? 0.6;
  const composite_score =
    llm_score !== undefined
      ? heuristic_score * (1 - llmWeight) + llm_score * llmWeight
      : heuristic_score;

  const adviceMap = ADVICE[lang] ?? ADVICE.en;
  const summary_advice: string[] = [];
  for (const r of reasons) {
    const a = adviceMap[r.code];
    if (a) summary_advice.push(a);
  }
  if (panel?.combined_recommendations) {
    for (const rec of panel.combined_recommendations) {
      if (!summary_advice.includes(rec)) summary_advice.push(rec);
    }
  }

  return {
    language: lang,
    composite_score: Math.round(composite_score * 100) / 100,
    verdict: deriveVerdict(composite_score, reasons),
    heuristic_score: Math.round(heuristic_score * 100) / 100,
    llm_score: llm_score !== undefined ? Math.round(llm_score * 100) / 100 : undefined,
    signals: { burstiness, ai_phrases, fragment_lists, parallel_structure, em_dash, not_x_but_y, llm_panel: panel },
    reasons,
    per_sentence: buildPerSentence(sentences, lang, parallel_structure.runs, ai_phrases.hits),
    summary_advice,
    stats: {
      sentences: sentences.length,
      paragraphs: paragraphs.length,
      words: words.length,
    },
  };
}
