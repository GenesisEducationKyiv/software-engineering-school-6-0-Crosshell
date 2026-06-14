import type { IScannerMetrics } from '@/modules/scanner';
import {
  scannerRunsTotal,
  scannerNewReleasesTotal,
  scannerErrorsTotal,
  scannerDurationSeconds,
} from './metrics.registry';

export class ScannerMetrics implements IScannerMetrics {
  incRuns(): void {
    scannerRunsTotal.inc();
  }

  incNewReleases(): void {
    scannerNewReleasesTotal.inc();
  }

  incErrors(): void {
    scannerErrorsTotal.inc();
  }

  observeDuration(seconds: number): void {
    scannerDurationSeconds.observe(seconds);
  }
}
