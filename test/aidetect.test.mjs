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
