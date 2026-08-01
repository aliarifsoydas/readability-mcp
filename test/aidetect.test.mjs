import test from "node:test";
import assert from "node:assert/strict";
import { aiDetectScore } from "../.test-build/aidetect.js";

const flagsFor = (result, startsWith) =>
  result.per_sentence.find((s) => s.text.startsWith(startsWith))?.flags ?? [];

test("Russian zero-copula sentences are not fragments", async () => {
  // Russian drops the present-tense copula, so these are complete sentences.
  const text =
    "Он врач. Москва — столица России. Это важно. Каждый день приносит новые задачи. " +
    "Наша команда работает над проектом уже несколько месяцев подряд без перерыва.";
  const r = await aiDetectScore(text, { language: "ru" });
  for (const start of ["Он врач", "Москва", "Это важно", "Каждый день"]) {
    assert.ok(!flagsFor(r, start).includes("fragment"), `${start} was flagged as a fragment`);
  }
});

test("Russian verbless noun-phrase sentences are fragments", async () => {
  const text = "Высокое качество. Быстрая доставка. Удобный интерфейс. Надёжная поддержка.";
  const r = await aiDetectScore(text, { language: "ru" });
  for (const start of ["Высокое", "Быстрая", "Удобный", "Надёжная"]) {
    assert.ok(flagsFor(r, start).includes("fragment"), `${start} was not flagged as a fragment`);
  }
});

test("one occurrence is counted once even when list entries nest", async () => {
  // "tapestry" sits inside "rich tapestry", "pivotal role" inside "plays a
  // pivotal role". Counting both would score a single phrase twice over.
  const cases = [
    ["en", "The book is a rich tapestry of ideas.", "rich tapestry"],
    ["en", "It plays a pivotal role in the process.", "plays a pivotal role"],
    ["en", "They embark on a journey through the data.", "embark on a journey"],
    ["tr", "Hiç şüphesiz bu böyledir.", "hiç şüphesiz"],
    ["ru", "Это является неотъемлемой частью процесса.", "является неотъемлемой частью"],
  ];
  for (const [language, text, expected] of cases) {
    const r = await aiDetectScore(text, { language });
    assert.equal(r.signals.ai_phrases.total, 1, `${text} -> ${JSON.stringify(r.signals.ai_phrases.hits)}`);
    assert.equal(r.signals.ai_phrases.hits[0].phrase, expected, "the longer, more specific entry should win");
  }
});

test("repeated distinct phrases still accumulate", async () => {
  const text = "In conclusion, it is worth noting the tapestry here. In summary, we embark on a journey.";
  const r = await aiDetectScore(text, { language: "en" });
  assert.ok(r.signals.ai_phrases.total >= 4, `only ${r.signals.ai_phrases.total} counted`);
});

test("Russian noun-phrase bullets are fragments", async () => {
  // The shape LLM bullet lists actually take in Russian. No determiner and no
  // adjective to key on — only the missing predicate marks them.
  const text =
    "Наш сервис решает задачи бизнеса быстро и надёжно каждый день.\n\n" +
    "Гибкий график. Экономия времени. Доступ к глобальному рынку талантов. Снижение операционных расходов.\n\n" +
    "Мы работаем с компаниями разного масштаба уже более десяти лет подряд.";
  const r = await aiDetectScore(text, { language: "ru" });
  for (const start of ["Экономия", "Доступ", "Снижение"]) {
    assert.ok(flagsFor(r, start).includes("fragment"), `${start} was not flagged as a fragment`);
  }
  assert.ok(r.signals.fragment_lists.score > 0, "the fragment-run signal did not fire");
});

test("nouns ending in -ость are not mistaken for infinitives", async () => {
  // "точность" ends in "ть" exactly like an infinitive does, which would hide
  // a whole class of Russian bullet fragments behind a phantom verb.
  const text =
    "Платформа обрабатывает заявки клиентов в течение одного рабочего дня без задержек.\n\n" +
    "Высокая точность. Масштабируемость решений. Надёжность хранения. Прозрачность отчётности.";
  const r = await aiDetectScore(text, { language: "ru" });
  for (const start of ["Высокая точность", "Масштабируемость", "Надёжность", "Прозрачность"]) {
    assert.ok(flagsFor(r, start).includes("fragment"), `${start} was not flagged`);
  }
});

test("lowercase debris from abbreviation splits is not a fragment", async () => {
  // "лезг.", "нем." and friends make the sentence splitter cut mid-clause; the
  // lowercase pieces it leaves behind must not read as a fragment run.
  const text =
    "Слово встречается во многих языках. Ср. лезг. кац, лит. katė, нем. Katze, прусск. catto, фр. chat.";
  const r = await aiDetectScore(text, { language: "ru" });
  assert.equal(r.signals.fragment_lists.score, 0, "abbreviation debris triggered a fragment run");
});

test("the Russian dash is scored far more leniently than elsewhere", async () => {
  // The dash is a grammatical copula in Russian, so identical density must not
  // carry the same weight it does in English.
  const ru = "Москва — столица России. Волга — река. Байкал — озеро. Наука — двигатель прогресса.";
  const en = "Moscow — the capital. Volga — a river. Baikal — a lake. Science — an engine of progress.";
  const rr = await aiDetectScore(ru, { language: "ru" });
  const re = await aiDetectScore(en, { language: "en" });
  assert.equal(rr.signals.em_dash.count, re.signals.em_dash.count);
  assert.ok(
    rr.signals.em_dash.score < re.signals.em_dash.score,
    `ru ${rr.signals.em_dash.score} !< en ${re.signals.em_dash.score}`,
  );
});

test("Russian LLM stock phrases are detected", async () => {
  const text =
    "В современном мире технологии играют ключевую роль. Важно отметить, что это открывает новые возможности. " +
    "Подводя итог, можно сказать, что данный подход является неотъемлемой частью процесса.";
  const r = await aiDetectScore(text, { language: "ru" });
  assert.ok(r.signals.ai_phrases.total >= 4, `only ${r.signals.ai_phrases.total} phrases matched`);
});

test("the Russian 'not only X but also Y' pattern is detected", async () => {
  const text = "Проект не только снижает расходы, но и повышает качество обслуживания клиентов компании.";
  const r = await aiDetectScore(text, { language: "ru" });
  assert.ok(r.signals.not_x_but_y.count >= 1);
});

test("plain Russian prose does not trigger the pattern signals", async () => {
  const text =
    "Кот проснулся рано и пошёл во двор. Там он долго сидел под старой яблоней и следил за птицами. " +
    "Потом хозяйка позвала его домой, и он неохотно вернулся на кухню, где его ждала миска молока. " +
    "Вечером он снова ушёл гулять.";
  const r = await aiDetectScore(text, { language: "ru" });
  assert.equal(r.signals.ai_phrases.total, 0);
  assert.equal(r.signals.not_x_but_y.count, 0);
  assert.ok(r.heuristic_score < 50, `heuristic score ${r.heuristic_score} too high for plain prose`);
});

test("a long unbroken letter run does not blow up the matcher", async () => {
  // Guards a quadratic backtracking path in the Russian verb hint: one 64 KB
  // Cyrillic "word" used to take ~52s, enough to exhaust a Worker's CPU budget.
  const hostile = `${"ж".repeat(64_000)} ${"щ".repeat(64_000)}`;
  const started = performance.now();
  const r = await aiDetectScore(hostile, { language: "ru" });
  const elapsed = performance.now() - started;
  assert.ok(Number.isFinite(r.heuristic_score));
  assert.ok(elapsed < 2_000, `took ${elapsed.toFixed(0)}ms — backtracking has regressed`);
});

test("scoring survives degenerate input in every mode", async () => {
  for (const input of [".", "  ", "Слово", "1234", "🙂"]) {
    for (const language of ["ru", "en", "auto"]) {
      const r = await aiDetectScore(input, { language });
      assert.ok(Number.isFinite(r.heuristic_score), `${language} / ${JSON.stringify(input)}`);
      assert.ok(r.heuristic_score >= 0 && r.heuristic_score <= 100);
      assert.ok(Array.isArray(r.reasons));
    }
  }
});
