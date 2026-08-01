import test from "node:test";
import assert from "node:assert/strict";
import { flowScore } from "../.test-build/flow.js";
import { seoScore } from "../.test-build/seo.js";
import { SUPPORTED_LANGUAGES } from "../.test-build/scorers/index.js";

const RU_CONNECTED =
  "Городской совет утвердил план, однако жители сомневаются в сроках, потому что похожий документ " +
  "принимали десять лет назад. Кроме того, эксперты отмечают, что успех зависит от финансирования. " +
  "Например, метро строят медленно. Таким образом, сроки могут сдвинуться.";

test("Russian connectives are matched despite Cyrillic word boundaries", () => {
  // JS \b is ASCII-only, so a naive boundary would match nothing here.
  const r = flowScore(RU_CONNECTED, "ru");
  assert.ok(
    r.details.connective_density.total_connectives >= 4,
    `only ${r.details.connective_density.total_connectives} connectives found`,
  );
});

test("flow scores are in range for every language", () => {
  for (const lang of SUPPORTED_LANGUAGES) {
    const r = flowScore("One sentence here. Another sentence follows it. A third one closes.", lang);
    assert.equal(r.language, lang);
    assert.ok(r.overall_100 >= 0 && r.overall_100 <= 100);
    for (const [key, value] of Object.entries(r.metrics_100)) {
      assert.ok(Number.isFinite(value) && value >= 0 && value <= 100, `${lang} ${key} = ${value}`);
    }
    assert.ok(r.interpretation.length > 0);
  }
});

test("seo_score defaults to the Russian formula and returns Russian copy", () => {
  const r = seoScore(RU_CONNECTED, {});
  assert.equal(r.language, "ru");
  assert.equal(r.formula, "oborneva");
  assert.ok(/[Ѐ-ӿ]/.test(r.verdict), `verdict not in Russian: ${r.verdict}`);
  assert.ok(r.overall_100 >= 0 && r.overall_100 <= 100);
  assert.equal(typeof r.passed, "boolean");
});

test("seo_score rejects a formula that the language does not provide", () => {
  assert.throws(() => seoScore(RU_CONNECTED, { formula: "atesman" }), /not available for language 'ru'/);
});

test("seo_score honours an explicit Russian formula", () => {
  for (const formula of ["oborneva", "matskovskiy", "tuldava"]) {
    const r = seoScore(RU_CONNECTED, { formula });
    assert.equal(r.formula, formula);
    assert.ok(Number.isFinite(r.readability_raw));
  }
});

test("every language has a verdict bundle", () => {
  for (const lang of SUPPORTED_LANGUAGES) {
    const r = seoScore("Short text here. Another sentence follows. A third closes it.", { language: lang });
    assert.ok(typeof r.verdict === "string" && r.verdict.length > 0, `${lang} has no verdict`);
  }
});
