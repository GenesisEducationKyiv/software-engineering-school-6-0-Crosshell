# Spec Delta: release-scanning

## ADDED Requirements

### Requirement: Scan Releases Use Case

A `ScanReleasesUseCase` application class SHALL implement the inbound `ScanReleases` port. It MUST: (a) load tracked repositories together with their confirmed subscribers via the `TrackedRepositoryRepository` port, (b) for each repository, query the latest release via the `VcsProvider` port, (c) when the release tag differs from `lastSeenTag`, publish a single notification message via the `NotificationPublisher` port and update `lastSeenTag` via the repository port, (d) isolate per-repository failures so one error does not abort the scan, and (e) translate `RateLimitError` into a warn-level log without surfacing it as a fatal scan error.

#### Scenario: New release for a tracked repo publishes one notification
- **WHEN** the use case is invoked
- **AND** a tracked repo `owner/repo` has `lastSeenTag='v1'` and the VCS returns latest release `tagName='v2'`
- **THEN** `NotificationPublisher.publish` is called exactly once with `{ repositoryOwner, repositoryRepo, newTag: 'v2', releaseUrl, subscribers }`
- **AND** `TrackedRepositoryRepository.updateLastSeenTag(id, 'v2')` is called

#### Scenario: Unchanged tag publishes nothing
- **WHEN** the VCS latest release tag equals the repo's `lastSeenTag`
- **THEN** `NotificationPublisher.publish` is not called
- **AND** `updateLastSeenTag` is not called

#### Scenario: One repo failing does not abort the scan
- **WHEN** the VCS query throws for repo A but succeeds for repo B
- **THEN** repo B's publish + tag update still occurs
- **AND** the use case returns without re-throwing repo A's error

#### Scenario: Rate-limit during scan is degraded, not fatal
- **WHEN** the VCS throws `RateLimitError` for repo C
- **THEN** the use case logs a warning for repo C
- **AND** continues scanning the remaining repos
- **AND** does not re-throw

### Requirement: Cron Inbound Adapter

The scan SHALL be triggered by a single inbound adapter at `src/adapters/inbound/cron/scanner-cron.adapter.ts`. The adapter MUST own all `node-cron` scheduling concerns, MUST call only the `ScanReleases` inbound port, and MUST emit `scannerRunsTotal` and `scannerNewReleasesTotal` metrics. The `ScanReleases` use case itself MUST NOT import `node-cron` or any metrics module.

#### Scenario: Cron adapter is the only `node-cron` consumer
- **WHEN** a grep searches for `import .* from ['\"]node-cron['\"]` under `src/`
- **THEN** the only match is in `src/adapters/inbound/cron/scanner-cron.adapter.ts`

#### Scenario: Cron adapter increments run metric on every tick
- **WHEN** the cron schedule fires
- **THEN** `scannerRunsTotal` is incremented before the use case runs
- **AND** the use case is invoked exactly once per tick
