export interface RawScoreResult {
  language: string;
  interpretation: string;
  metrics: Record<string, number>;
  stats: Record<string, number>;
}

export interface ScoreResult extends RawScoreResult {
  overall_100: number;
  metrics_100: Record<string, number>;
}
