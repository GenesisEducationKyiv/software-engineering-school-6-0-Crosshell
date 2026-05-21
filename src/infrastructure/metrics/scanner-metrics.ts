import type { IScannerMetrics } from '@/modules/scanner/interfaces/scanner-metrics.interface';
import { scannerRunsTotal, scannerNewReleasesTotal } from './metrics.registry';

export class ScannerMetrics implements IScannerMetrics {
  incRuns(): void {
    scannerRunsTotal.inc();
  }

  incNewReleases(): void {
    scannerNewReleasesTotal.inc();
  }
}
