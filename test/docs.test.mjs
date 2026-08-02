/**
 * The published contract must describe what the code actually returns. These
 * tests compare the OpenAPI response schemas against live tool output, so a
 * new field or a renamed one fails the build instead of silently drifting.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { TOOLS, renderOpenApi, renderDocsHtml } from "../.test-build/docs.js";
import { scoreText, SUPPORTED_LANGUAGES } from "../.test-build/scorers/index.js";
import { flowScore } from "../.test-build/flow.js";
import { seoScore } from "../.test-build/seo.js";
import { aiDetectScore } from "../.test-build/aidetect.js";

const SAMPLE =
  "Bu bir Türkçe metindir. Cümleler değişken uzunlukta. Ancak yine de akıcı olmalı. Sonuçları görelim.";

const doc = (name) => TOOLS.find((t) => t.name === name);

test("every tool documents a response schema", () => {
  for (const t of TOOLS) {
    assert.ok(t.output_schema, `${t.name} has no output_schema`);
    assert.equal(t.output_schema.type, "object", t.name);
    assert.ok(Object.keys(t.output_schema.properties ?? {}).length > 0, `${t.name} schema has no properties`);
  }
});

test("the OpenAPI document serves those schemas and round-trips as JSON", () => {
  const spec = renderOpenApi();
  const paths = Object.entries(spec.paths);
  assert.equal(paths.length, TOOLS.length);
  for (const [path, entry] of paths) {
    const schema = entry.post.responses["200"].content["application/json"].schema;
    assert.ok(schema, `${path} response has no schema`);
    assert.equal(schema.type, "object", path);
  }
  assert.equal(JSON.parse(JSON.stringify(spec)).openapi, "3.1.0");
});

/** Every documented property must exist in the real output, and vice versa. */
function assertShape(name, actual) {
  const schema = doc(name).output_schema;
  const documented = new Set(Object.keys(schema.properties));
  for (const key of Object.keys(actual)) {
    if (actual[key] === undefined) continue;
    assert.ok(documented.has(key), `${name} returns "${key}" but the schema does not document it`);
  }
  for (const key of schema.required ?? []) {
    assert.ok(key in actual, `${name} schema requires "${key}" but the output has no such field`);
  }
}

test("score_text output matches its schema", () => {
  assertShape("score_text", scoreText(SAMPLE, "tr"));
});

test("flow_score output matches its schema", () => {
  const r = flowScore(SAMPLE, "tr");
  assertShape("flow_score", r);
  for (const key of Object.keys(r.metrics_100)) {
    assert.ok(doc("flow_score").output_schema.properties.metrics_100.properties[key], `undocumented metric ${key}`);
  }
});

test("seo_score output matches its schema", () => {
  assertShape("seo_score", seoScore(SAMPLE, {}));
});

test("ai_score output and its signal set match the schema", async () => {
  const r = await aiDetectScore(SAMPLE, { language: "tr" });
  assertShape("ai_score", r);
  const documented = doc("ai_score").output_schema.properties.signals.properties;
  for (const key of Object.keys(r.signals)) {
    if (r.signals[key] === undefined) continue;
    assert.ok(documented[key], `signal "${key}" is undocumented`);
    for (const field of Object.keys(r.signals[key])) {
      if (r.signals[key][field] === undefined) continue;
      assert.ok(documented[key].properties[field], `signals.${key}.${field} is undocumented`);
    }
  }
});

test("the documented language enums match the supported set", () => {
  for (const t of TOOLS) {
    // A tool may support every language or deliberately narrow itself to a few
    // (grammar_check is Turkish only); either way it may never list a language
    // the scorer does not support.
    const param = t.params.find((p) => p.name === "language");
    if (param?.enum) {
      const declared = param.enum.filter((l) => l !== "auto");
      for (const lang of declared) {
        assert.ok(SUPPORTED_LANGUAGES.includes(lang), `${t.name} lists unsupported language ${lang}`);
      }
      if (declared.length === SUPPORTED_LANGUAGES.length) {
        assert.deepEqual(param.enum, ["auto", ...SUPPORTED_LANGUAGES], `${t.name} language enum is stale`);
      }
    }
    const prop = t.output_schema.properties?.language;
    if (prop?.enum) {
      for (const lang of prop.enum) {
        assert.ok(SUPPORTED_LANGUAGES.includes(lang), `${t.name} response lists unsupported language ${lang}`);
      }
      if (prop.enum.length === SUPPORTED_LANGUAGES.length) {
        assert.deepEqual(prop.enum, [...SUPPORTED_LANGUAGES], `${t.name} response enum is stale`);
      }
    }
  }
});

test("the HTML catalog renders every tool with its schema", () => {
  const html = renderDocsHtml();
  for (const t of TOOLS) assert.ok(html.includes(t.name), `${t.name} missing from /docs`);
  assert.equal((html.match(/Full response schema/g) ?? []).length, TOOLS.length);
});
