/**
 * Arabic is the first language in this project whose script hides the
 * information the other formulas rely on: it is written without short vowels,
 * so syllables cannot be counted. These tests pin the decisions that follow.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { normalizeArabic, splitSentences, splitWords, basicStats } from "../.test-build/text.js";
import { scoreText, detectLanguage } from "../.test-build/scorers/index.js";
import { seoScore } from "../.test-build/seo.js";
import { aiDetectScore } from "../.test-build/aidetect.js";
import { buildJudgePrompt } from "../.test-build/llm_judge.js";
import { normalizeMetric } from "../.test-build/normalize.js";

const PLAIN = "العربية لغة جميلة وغنية بالمفردات. يتعلمها الناس في كل مكان.";
const DIACRITIC = "الْعَرَبِيَّةُ لُغَةٌ جَمِيلَةٌ وَغَنِيَّةٌ بِالْمُفْرَدَاتِ. يَتَعَلَّمُهَا النَّاسُ فِي كُلِّ مَكَانٍ.";

test("diacritics are stripped so they cannot inflate character counts", () => {
  // The same sentence with full tashkeel has roughly twice the characters.
  // Without normalization every character-based measure would double.
  assert.equal(normalizeArabic(DIACRITIC), normalizeArabic(PLAIN));
  const a = scoreText(DIACRITIC, "ar");
  const b = scoreText(PLAIN, "ar");
  assert.equal(a.stats.characters, b.stats.characters);
  assert.deepEqual(a.metrics, b.metrics);
});

test("letter shapes Arabic writes interchangeably are unified", () => {
  assert.equal(normalizeArabic("أإآا"), "اااا");
  assert.equal(normalizeArabic("مقهى"), "مقهي");
  assert.equal(normalizeArabic("مدرسة"), "مدرسه");
  assert.equal(normalizeArabic("الـــعربية"), "العربيه");
  assert.equal(normalizeArabic("٢٠٢٤"), "2024");
});

test("the Arabic question mark and semicolon end a sentence", () => {
  assert.equal(splitSentences("ما اسمك؟ أنا أحمد. كيف حالك؟").length, 3);
  assert.equal(splitSentences("جاء الرجل؛ ثم غادر.").length, 2);
});

test("Arabic text is detected by script", () => {
  assert.equal(detectLanguage(PLAIN), "ar");
  assert.equal(detectLanguage("شركة أبل أطلقت هاتف iPhone الجديد في السوق."), "ar");
  assert.equal(detectLanguage("The quick brown fox jumps over the lazy dog today."), "en");
});

test("the Arabic scorer ships only the formulas that measure something", () => {
  // OSMAN, Arabic Flesch and Arabic Kincaid all depend on counting syllables and
  // score between -0.11 and +0.16 against BAREC. They are deliberately absent.
  const r = scoreText(PLAIN, "ar");
  assert.deepEqual(Object.keys(r.metrics).sort(), ["arabic_ari", "awl_asl_index"]);
  assert.ok(!("osman" in r.metrics));
  assert.ok(!("arabic_flesch" in r.metrics));
});

test("Arabic formulas match their definitions", () => {
  const r = scoreText(PLAIN, "ar");
  const asl = r.stats.avg_sentence_length;
  const awl = r.stats.avg_word_length;
  assert.ok(Math.abs(r.metrics.awl_asl_index - awl * Math.log10(asl)) < 0.005);
  assert.ok(Math.abs(r.metrics.arabic_ari - (4.71 * awl + 0.5 * asl - 21.43)) < 0.05);
});

test("simpler Arabic scores higher than dense Arabic", () => {
  const simple = "ذهب الولد إلى المدرسة.\nلعب مع أصدقائه.\nعاد إلى البيت.\nأكل الطعام.\nنام مبكرا.";
  const hard =
    "إن التحول المؤسسي في العلاقات الاقتصادية داخل المجتمعات ما بعد الصناعية يتسم بتزايد " +
    "ملحوظ في أهمية تكنولوجيا المعلومات، الأمر الذي يستوجب إعادة النظر في المقاربات المنهجية " +
    "التقليدية المستخدمة في تحليل إنتاجية العمل ضمن المنظومات الإنتاجية الموزعة.";
  const s = scoreText(simple, "ar");
  const h = scoreText(hard, "ar");
  assert.ok(s.overall_100 > h.overall_100, `${s.overall_100} !> ${h.overall_100}`);
});

test("BAREC level anchors land where the corpus says they should", () => {
  // Mean raw value measured by this tokenizer per BAREC level, from the train
  // split. Regenerate with `npm run benchmark:ar` if the tokenizer changes.
  const CORPUS = [
    [7, 2.756, 0.99, 70],
    [9, 3.586, 2.59, 60],
    [11, 4.964, 6.39, 50],
    [13, 5.91, 10.32, 40],
    [14, 6.26, 12.22, 35],
  ];
  for (const [level, idx, ari, target] of CORPUS) {
    assert.ok(Math.abs(normalizeMetric("awl_asl_index", idx) - target) <= 2, `level ${level} index`);
    assert.ok(Math.abs(normalizeMetric("arabic_ari", ari) - target) <= 2, `level ${level} ari`);
  }
});

test("seo_score defaults to the Arabic formula and answers in Arabic", () => {
  const r = seoScore(PLAIN, {});
  assert.equal(r.language, "ar");
  assert.equal(r.formula, "awl_asl_index");
  assert.ok(/[؀-ۿ]/.test(r.verdict), r.verdict);
});

test("Arabic nominal sentences are never called fragments", async () => {
  // Every one of these is a complete verbless sentence. Fragment detection is
  // disabled for Arabic precisely so that they cannot be flagged.
  const text = "العلم نور والجهل ظلام.\nالكتاب خير جليس في الزمان.\nالصبر مفتاح الفرج.\nالوقت من ذهب.";
  const r = await aiDetectScore(text, { language: "ar" });
  assert.equal(r.signals.fragment_lists.score, 0);
  assert.ok(r.per_sentence.every((s) => !s.flags.includes("fragment")));
  // Even a genuine bullet run stays silent — a documented, deliberate gap.
  const bullets = "خدمة سريعة. جودة عالية. أسعار مناسبة. دعم مستمر.";
  assert.equal((await aiDetectScore(bullets, { language: "ar" })).signals.fragment_lists.score, 0);
});

test("the Arabic antithesis pattern is detected", async () => {
  for (const s of [
    "هذه ليست مشكلة تقنية بل مشكلة ثقافية.",
    "ليس فقط أسرع بل أكثر موثوقية أيضا.",
    "لا نحتاج بيانات أكثر بل أسئلة أفضل.",
  ]) {
    const r = await aiDetectScore(s, { language: "ar" });
    assert.ok(r.signals.not_x_but_y.count > 0, s);
  }
});

test("ordinary Arabic negation is not antithesis", async () => {
  for (const s of [
    "لم يحضر الاجتماع يوم الثلاثاء الماضي بسبب المرض.",
    "النتائج لم تكن ذات دلالة إحصائية في هذه الدراسة.",
  ]) {
    const r = await aiDetectScore(s, { language: "ar" });
    assert.equal(r.signals.not_x_but_y.count, 0, s);
  }
});

test("Arabic gets its own judge prompt, not the English fallback", () => {
  const ar = buildJudgePrompt(PLAIN, "ar");
  assert.notEqual(ar.system, buildJudgePrompt(PLAIN, "en").system);
  assert.ok(/[؀-ۿ]/.test(ar.system));
  assert.ok(/الجملة الاسمية/.test(ar.system), "does not warn about verbless nominal sentences");
  assert.ok(ar.user.startsWith("اللغة: العربية"));
});

test("Arabic survives degenerate input", () => {
  for (const input of ["", "   ", "؟؟؟", "١٢٣", "🙂"]) {
    const r = scoreText(input, "ar");
    assert.ok(Number.isFinite(r.overall_100));
    assert.ok(r.overall_100 >= 0 && r.overall_100 <= 100);
  }
});
