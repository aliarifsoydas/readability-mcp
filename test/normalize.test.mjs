import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMetric, normalizeMetrics, overallScore, clamp100 } from "../.test-build/normalize.js";

/** Every metric name the scorers can emit, with the raw sweep to probe it over. */
const METRICS = {
  flesch_reading_ease: [-200, 200],
  flesch_kincaid_grade: [-5, 40],
  gunning_fog: [0, 40],
  smog_index: [0, 40],
  coleman_liau_index: [-5, 40],
  automated_readability_index: [-5, 40],
  atesman: [-200, 200],
  bezirci_yilmaz: [0, 60],
  cetinkaya_uzun: [-100, 150],
  fernandez_huerta: [-200, 200],
  szigriszt_pazos: [-200, 200],
  flesch_deutsch: [-200, 200],
  wiener_sachtextformel: [0, 30],
  kandel_moles: [-200, 200],
  gulpease: [-50, 150],
  oborneva: [-300, 250],
  matskovskiy: [0, 60],
  tuldava: [0, 12],
};

function sweep(name, [lo, hi], steps = 400) {
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const raw = lo + ((hi - lo) * i) / steps;
    out.push(normalizeMetric(name, raw));
  }
  return out;
}

test("normalized values stay finite and inside 0-100", () => {
  for (const [name, range] of Object.entries(METRICS)) {
    for (const value of sweep(name, range)) {
      assert.ok(Number.isFinite(value), `${name} produced ${value}`);
      assert.ok(value >= 0 && value <= 100, `${name} produced ${value}`);
    }
  }
});

test("every curve is monotonic in one direction", () => {
  // A curve that reverses direction would rank a harder text as easier.
  for (const [name, range] of Object.entries(METRICS)) {
    const values = sweep(name, range);
    const rising = values[values.length - 1] >= values[0];
    for (let i = 1; i < values.length; i++) {
      const ok = rising ? values[i] >= values[i - 1] - 1e-9 : values[i] <= values[i - 1] + 1e-9;
      assert.ok(ok, `${name} reverses at index ${i}: ${values[i - 1]} -> ${values[i]}`);
    }
  }
});

test("Russian grade anchors land where the corpus says they should", () => {
  // Mean raw value this scorer measures per grade over the Russian Readability
  // Corpus, as reported by `npm run benchmark`. Regenerate both if the
  // tokenizer changes. [grade, oborneva, matskovskiy, tuldava, expected]
  const CORPUS = [
    [5, 42.63, 8.38, 2.314, 90],
    [6, 22.98, 10.46, 2.754, 80],
    [7, 14.11, 11.21, 2.933, 70],
    [8, 3.64, 12.26, 3.17, 60],
    [9, -3.23, 13.19, 3.354, 50],
    [10, -8.44, 13.91, 3.498, 40],
    [11, -12.29, 14.37, 3.597, 30],
  ];
  for (const [grade, oborneva, matskovskiy, tuldava, target] of CORPUS) {
    for (const [name, raw] of [["oborneva", oborneva], ["matskovskiy", matskovskiy], ["tuldava", tuldava]]) {
      const got = normalizeMetric(name, raw);
      assert.ok(Math.abs(got - target) <= 2, `grade ${grade} ${name}: ${got} vs ${target}`);
    }
  }
});

test("the three Russian formulas agree with each other on the same text", () => {
  // They are normalized onto one scale, so a wide split means a miscalibrated curve.
  const POINTS = [
    [4.9, 1.67, 0],
    [14.0, 2.57, 25.7],
    [26.5, 3.94, 62.3],
  ];
  for (const [asl, asw, x4] of POINTS) {
    const values = [
      normalizeMetric("oborneva", 206.836 - 1.52 * asl - 65.14 * asw),
      normalizeMetric("matskovskiy", 0.62 * asl + 0.123 * x4 + 0.051),
      normalizeMetric("tuldava", asw * Math.log10(asl)),
    ];
    const spread = Math.max(...values) - Math.min(...values);
    assert.ok(spread <= 12, `spread ${spread.toFixed(1)} at ASL=${asl} ASW=${asw}: ${values.join(", ")}`);
  }
});

test("unknown metric names fall back to a clamp", () => {
  assert.equal(normalizeMetric("not_a_real_metric", 150), 100);
  assert.equal(normalizeMetric("not_a_real_metric", -10), 0);
  assert.equal(normalizeMetric("not_a_real_metric", 42), 42);
});

test("helpers behave", () => {
  assert.equal(clamp100(-1), 0);
  assert.equal(clamp100(101), 100);
  assert.equal(overallScore({}), 0);
  assert.equal(overallScore({ a: 40, b: 60 }), 50);
  assert.deepEqual(Object.keys(normalizeMetrics({ oborneva: 0, tuldava: 3 })), ["oborneva", "tuldava"]);
});
