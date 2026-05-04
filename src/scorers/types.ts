export interface ScoreResult {
  language: string;
  interpretation: string;
  metrics: Record<string, number>;
  stats: Record<string, number>;
}
