type Anchor = [raw: number, normalized: number];

export function clamp100(v: number): number {
  if (v < 0) return 0;
  if (v > 100) return 100;
  return v;
}

export function average(values: number[]): number {
  if (values.length === 0) return 0;
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
}

function piecewiseLinear(value: number, anchors: readonly Anchor[]): number {
  const first = anchors[0]!;
  const last = anchors[anchors.length - 1]!;
  if (value <= first[0]) return first[1];
  if (value >= last[0]) return last[1];
  for (let i = 0; i < anchors.length - 1; i++) {
    const [x0, y0] = anchors[i]!;
    const [x1, y1] = anchors[i + 1]!;
    if (value >= x0 && value <= x1) {
      const t = (value - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return clamp100(value);
}

const IDENTITY: readonly Anchor[] = [
  [0, 0], [30, 30], [50, 50], [70, 70], [90, 90], [100, 100],
];

const FK_GRADE: readonly Anchor[] = [
  [0, 100], [5, 90], [6, 80], [7, 70], [8, 65], [10, 55], [12, 50], [14, 40], [16, 25], [18, 10], [22, 0],
];

const FOG_GRADE: readonly Anchor[] = [
  [0, 100], [6, 90], [8, 75], [10, 60], [12, 50], [14, 40], [16, 25], [18, 10], [22, 0],
];

const ARI_GRADE: readonly Anchor[] = [
  [0, 100], [5, 90], [7, 75], [9, 60], [11, 50], [13, 40], [14, 30], [16, 15], [20, 0],
];

const BEZIRCI_YOD: readonly Anchor[] = [
  [0, 100], [4, 85], [8, 70], [10, 60], [12, 50], [14, 40], [16, 30], [20, 15], [25, 0],
];

const CETINKAYA: readonly Anchor[] = [
  [0, 10], [17, 30], [34, 50], [42, 60], [51, 70], [60, 80], [70, 95], [80, 100],
];

const WIENER: readonly Anchor[] = [
  [4, 95], [5, 85], [6, 75], [7, 65], [8, 60], [10, 50], [12, 35], [14, 20], [15, 15], [18, 0],
];

/**
 * The Russian curves are fitted by running the scorer over the Russian
 * Readability Corpus (grade 5-11 textbooks) published with Ivanov, Solnyshkina
 * & Solovyev (Dialogue 2018), so that each grade lands on the same normalized
 * value across all three formulas: grade 5 -> 90 down to grade 11 -> 30.
 *
 * The anchors use the raw values this tokenizer measures, not the ASL/ASW in
 * the paper's Table 1 — the paper counts punctuation as tokens, so its figures
 * run about 8% higher and would shift every band. Re-fit with `npm run
 * benchmark`, which prints the mean raw value per grade.
 *
 * Below grade 11 the tails are extrapolated so that dense academic and official
 * prose, which scores far past the textbook range, still separates rather than
 * pinning to 0.
 */
const OBORNEVA: readonly Anchor[] = [
  [-140, 0], [-100, 5], [-70, 10], [-45, 15], [-25, 22], [-12.29, 30], [-8.44, 40], [-3.23, 50], [3.64, 60], [14.11, 70], [22.98, 80], [42.63, 90], [65, 100],
];

/**
 * Matskovskiy weighs the share of 4+ syllable words heavily and reacts less to
 * sentence length, so it is the coarsest of the three on short-sentence text.
 */
const MATSKOVSKIY: readonly Anchor[] = [
  [5, 100], [8.38, 90], [10.46, 80], [11.21, 70], [12.26, 60], [13.19, 50], [13.91, 40], [14.37, 30], [16, 22], [18.5, 15], [21, 10], [24, 6], [28, 2], [34, 0],
];

const TULDAVA: readonly Anchor[] = [
  [1.6, 100], [2.314, 90], [2.754, 80], [2.933, 70], [3.17, 60], [3.354, 50], [3.498, 40], [3.597, 30], [3.9, 22], [4.4, 15], [5.1, 9], [6, 4], [7.5, 0],
];

const ANCHOR_MAP: Record<string, readonly Anchor[]> = {
  flesch_reading_ease: IDENTITY,
  flesch_kincaid_grade: FK_GRADE,
  gunning_fog: FOG_GRADE,
  smog_index: FOG_GRADE,
  coleman_liau_index: FK_GRADE,
  automated_readability_index: ARI_GRADE,

  atesman: IDENTITY,
  bezirci_yilmaz: BEZIRCI_YOD,
  cetinkaya_uzun: CETINKAYA,

  fernandez_huerta: IDENTITY,
  szigriszt_pazos: IDENTITY,

  flesch_deutsch: IDENTITY,
  wiener_sachtextformel: WIENER,

  kandel_moles: IDENTITY,

  gulpease: IDENTITY,

  oborneva: OBORNEVA,
  matskovskiy: MATSKOVSKIY,
  tuldava: TULDAVA,
};

export function normalizeMetric(name: string, value: number): number {
  const anchors = ANCHOR_MAP[name];
  if (!anchors) return clamp100(value);
  return Math.round(piecewiseLinear(value, anchors) * 100) / 100;
}

export function normalizeMetrics(metrics: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, val] of Object.entries(metrics)) {
    out[key] = normalizeMetric(key, val);
  }
  return out;
}

export function overallScore(normalized: Record<string, number>): number {
  return Math.round(average(Object.values(normalized)) * 100) / 100;
}
