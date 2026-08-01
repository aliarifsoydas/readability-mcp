import test from "node:test";
import assert from "node:assert/strict";
import { scoreText, SUPPORTED_LANGUAGES } from "../.test-build/scorers/index.js";

const RU_SAMPLE =
  "Городской совет утвердил новый план развития транспорта, рассчитанный на ближайшие пять лет. " +
  "Он предполагает строительство двух линий метро и расширение сети автобусных маршрутов. " +
  "Однако жители сомневаются в сроках, потому что похожий план принимали десять лет назад.";

test("every supported language produces a complete result", () => {
  for (const lang of SUPPORTED_LANGUAGES) {
    const r = scoreText("Test text. Another sentence here. And a third one.", lang);
    assert.equal(r.language, lang);
    assert.ok(Object.keys(r.metrics).length > 0, `${lang} has no metrics`);
    assert.equal(Object.keys(r.metrics).length, Object.keys(r.metrics_100).length);
    assert.ok(Number.isFinite(r.overall_100), `${lang} overall not finite`);
    assert.ok(r.overall_100 >= 0 && r.overall_100 <= 100, `${lang} overall out of range`);
    assert.ok(typeof r.interpretation === "string" && r.interpretation.length > 0);
  }
});

test("Russian formulas match their published definitions", () => {
  const r = scoreText(RU_SAMPLE, "ru");
  const asl = r.stats.avg_sentence_length;
  const asw = r.stats.avg_syllables_per_word;
  const x4 = r.stats.long_word_percentage;

  // Ivanov, Solnyshkina & Solovyev (Dialogue 2018), section 2.
  assert.ok(Math.abs(r.metrics.oborneva - (206.836 - 1.52 * asl - 65.14 * asw)) < 0.05);
  assert.ok(Math.abs(r.metrics.matskovskiy - (0.62 * asl + 0.123 * x4 + 0.051)) < 0.05);
  assert.ok(Math.abs(r.metrics.tuldava - asw * Math.log10(asl)) < 0.005);
});

test("Russian long-word share counts words above three syllables", () => {
  // 2 of 4 words have 4+ syllables: "университеты" (6), "преподаватели" (6).
  const r = scoreText("Университеты и преподаватели тут.", "ru");
  assert.equal(r.stats.words, 4);
  assert.equal(r.stats.long_word_percentage, 50);
});

test("simpler Russian text always scores higher than harder Russian text", () => {
  const simple = "Кот спит. Мышь бежит. Дом стоит. Река течёт. Ветер дует.";
  const hard =
    "Институциональная трансформация экономических отношений характеризуется существенным " +
    "возрастанием роли информационных технологий, что обусловливает необходимость " +
    "переосмысления традиционных методологических подходов к анализу производительности труда.";
  const s = scoreText(simple, "ru");
  const h = scoreText(hard, "ru");
  assert.ok(s.overall_100 > h.overall_100, `${s.overall_100} !> ${h.overall_100}`);
  for (const key of Object.keys(s.metrics_100)) {
    assert.ok(s.metrics_100[key] > h.metrics_100[key], `${key}: ${s.metrics_100[key]} !> ${h.metrics_100[key]}`);
  }
});

test("scoring is deterministic and auto-detection agrees with the explicit code", () => {
  const a = scoreText(RU_SAMPLE, "auto");
  const b = scoreText(RU_SAMPLE, "ru");
  assert.deepEqual(a, b);
  assert.deepEqual(scoreText(RU_SAMPLE, "ru"), scoreText(RU_SAMPLE, "ru"));
});

test("degenerate input never yields NaN", () => {
  for (const input of ["", "   ", "...", "1234", "🙂", "а"]) {
    for (const lang of SUPPORTED_LANGUAGES) {
      const r = scoreText(input, lang);
      assert.ok(Number.isFinite(r.overall_100), `${lang} / ${JSON.stringify(input)}`);
      for (const [key, value] of Object.entries(r.metrics)) {
        assert.ok(Number.isFinite(value), `${lang} ${key} = ${value} for ${JSON.stringify(input)}`);
      }
      for (const [key, value] of Object.entries(r.metrics_100)) {
        assert.ok(value >= 0 && value <= 100, `${lang} ${key}_100 = ${value} out of range`);
      }
    }
  }
});
