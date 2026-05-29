export interface IScannerMetrics {
  incRuns(): void;
  incNewReleases(): void;
  incErrors(): void;
  observeDuration(seconds: number): void;
}
