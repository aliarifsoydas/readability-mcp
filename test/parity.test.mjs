/**
 * Russian must get the same first-class treatment English and Turkish get:
 * a native LLM judge prompt, a translated interface, and equally sized
 * heuristic lexicons. These tests fail if Russian drifts back to a fallback.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { buildJudgePrompt } from "../.test-build/llm_judge.js";
import { renderUiHtml } from "../.test-build/ui.js";

const CYRILLIC = /[Ѐ-ӿ]/;
const TEXT = "Кот спит на печке.\n\nМышь бежит домой.";

test("Russian gets its own LLM judge system prompt, not the English fallback", () => {
  const ru = buildJudgePrompt(TEXT, "ru").system;
  const en = buildJudgePrompt(TEXT, "en").system;
  const tr = buildJudgePrompt(TEXT, "tr").system;
  assert.notEqual(ru, en);
  assert.notEqual(ru, tr);
  assert.ok(CYRILLIC.test(ru), "Russian system prompt is not in Russian");
});

test("the Russian judge prompt warns about the traps that trip up Russian", () => {
  const ru = buildJudgePrompt(TEXT, "ru").system;
  assert.ok(ru.includes("—"), "does not mention the dash-as-copula rule");
  assert.ok(/без глагола/.test(ru), "does not mention verbless sentences");
});

test("every judge prompt carries the same evaluation dimensions", () => {
  const DIMENSIONS = [
    "vocabulary_register",
    "sentence_cadence",
    "factual_specificity",
    "ai_signature_phrasing",
    "domain_authenticity",
    "structural_markers",
    "style_consistency",
  ];
  for (const lang of ["en", "tr", "ru"]) {
    const { system } = buildJudgePrompt(TEXT, lang);
    for (const d of DIMENSIONS) {
      assert.ok(system.includes(d), `${lang} prompt is missing ${d}`);
    }
  }
});

test("prompt labels follow the language of the system prompt", () => {
  assert.ok(buildJudgePrompt(TEXT, "ru").user.startsWith("Язык: Русский"));
  assert.ok(buildJudgePrompt(TEXT, "tr").user.startsWith("Dil: Türkçe"));
  assert.ok(buildJudgePrompt(TEXT, "en").user.startsWith("Language: EN"));
  // Languages judged with the English prompt must not get Turkish labels.
  for (const lang of ["es", "de", "fr", "it"]) {
    const user = buildJudgePrompt(TEXT, lang).user;
    assert.ok(user.startsWith("Language: "), `${lang} label is not English: ${user.slice(0, 20)}`);
    assert.ok(!user.includes("METİN"), `${lang} still carries Turkish labels`);
  }
});

test("the judge prompt numbers paragraphs", () => {
  const user = buildJudgePrompt(TEXT, "ru").user;
  assert.ok(user.includes("[P0] Кот спит на печке."));
  assert.ok(user.includes("[P1] Мышь бежит домой."));
});

/** Slice the `T` i18n object out of the served page, one bundle per language. */
function uiBundleKeys(html, lang) {
  const marker = `\n  ${lang}:{`;
  const start = html.indexOf(marker);
  assert.notEqual(start, -1, `no ${lang} UI bundle`);
  const rest = html.slice(start + marker.length);
  const end = rest.search(/\n  (?:en|tr|ru):\{|\n\};/);
  const body = rest.slice(0, end === -1 ? undefined : end);
  // Only count identifiers in key position, so a colon inside a string value
  // ("could not be reached: ") is not mistaken for a key.
  return new Set([...body.matchAll(/(?:^|[{,]\s*)(\w+)\s*:/gm)].map((m) => m[1]));
}

test("the interface is translated into Russian, not just the analysis", () => {
  const html = renderUiHtml();
  assert.ok(html.includes('data-ui="ru"'), "no RU button in the language toggle");
  assert.ok(html.includes('<option value="ru">'), "Russian missing from the analysis language picker");
  assert.ok(/navLang\.indexOf\("ru"\)/.test(html), "browser locale detection does not handle Russian");
});

test("the Russian UI bundle defines every key English and Turkish define", () => {
  const html = renderUiHtml();
  const en = uiBundleKeys(html, "en");
  const ru = uiBundleKeys(html, "ru");
  const tr = uiBundleKeys(html, "tr");
  const missingFromRu = [...en].filter((k) => !ru.has(k));
  assert.deepEqual(missingFromRu, [], `Russian UI bundle is missing: ${missingFromRu.join(", ")}`);
  assert.deepEqual([...tr].filter((k) => !ru.has(k)), []);
  assert.ok(ru.size > 25, `Russian bundle looks too small (${ru.size} keys)`);
});
