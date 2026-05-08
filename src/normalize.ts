export function clamp100(v: number): number {
  if (v < 0) return 0;
  if (v > 100) return 100;
  return v;
}

export function gradeToScore100(grade: number, ceilingGrade: number): number {
  return clamp100(100 - (grade / ceilingGrade) * 100);
}

export function average(values: number[]): number {
  if (values.length === 0) return 0;
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
}

export const NORMALIZERS = {
  flesch_reading_ease: (v: number) => clamp100(v),
  flesch_kincaid_grade: (v: number) => gradeToScore100(v, 18),
  gunning_fog: (v: number) => gradeToScore100(v, 18),
  smog_index: (v: number) => gradeToScore100(v, 18),
  coleman_liau_index: (v: number) => gradeToScore100(v, 18),
  automated_readability_index: (v: number) => gradeToScore100(v, 14),

  atesman: (v: number) => clamp100(v),
  bezirci_yilmaz: (v: number) => gradeToScore100(v, 20),
  cetinkaya_uzun: (v: number) => clamp100(v),

  fernandez_huerta: (v: number) => clamp100(v),
  szigriszt_pazos: (v: number) => clamp100(v),

  flesch_deutsch: (v: number) => clamp100(v),
  wiener_sachtextformel: (v: number) => gradeToScore100(v, 15),

  kandel_moles: (v: number) => clamp100(v),

  gulpease: (v: number) => clamp100(v),
} as const;

export function normalizeMetrics(metrics: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, val] of Object.entries(metrics)) {
    const fn = NORMALIZERS[key as keyof typeof NORMALIZERS];
    out[key] = fn ? Math.round(fn(val) * 100) / 100 : val;
  }
  return out;
}

export function overallScore(normalized: Record<string, number>): number {
  return Math.round(average(Object.values(normalized)) * 100) / 100;
}
