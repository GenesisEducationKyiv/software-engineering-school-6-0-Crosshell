export interface IScannerMetrics {
  incRuns(): void;
  incNewReleases(): void;
  incErrors(stage: 'db' | 'scan'): void;
  observeDuration(seconds: number): void;
}
