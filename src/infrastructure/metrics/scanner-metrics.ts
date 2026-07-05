import type { IScannerMetrics } from '@/modules/scanner/interfaces/scanner-metrics.interface';
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

  incErrors(stage: 'db' | 'scan'): void {
    scannerErrorsTotal.inc({ stage });
  }

  observeDuration(seconds: number): void {
    scannerDurationSeconds.observe(seconds);
  }
}
