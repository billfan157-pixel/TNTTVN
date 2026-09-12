# Operations list/readiness benchmark — post-two-phase-read re-measure (D4')

> Synthetic local evidence only. NOT an SLO, NOT a production claim, NOT comparable
> to plan-doc §18 numbers (different implementation + different machine state;
> §18 measurement conditions were never fully recorded).

## Conditions (both runs)

- Command: `npm run benchmark:operations` (`scripts/run-operations-benchmark.mjs` →
  `scripts/benchmark-operations.ts` via tsx; isolated temp SQLite, `TURSO_URL=''`,
  torn down afterwards).
- Profile: 250 events / 1000 tasks (250 required readiness tasks) / page 50 /
  5 warmups / 20 samples. In-process `operationsRouter.request` calls (no HTTP,
  no auth middleware cost beyond JWT verify, no client).
- Runtime: Node v24.14.1, win32 x64, dev workstation (background load uncontrolled,
  Windows Defender defaults). Date: 2026-09-12.

## Results

| Endpoint   | Run | min  | p50  | p95   | max    |
|------------|-----|------|------|-------|--------|
| events     | 1   | 7.7  | 30.7 | 273.7 | 1387.8 |
| events     | 2   | 5.5  | 8.5  | 11.8  | 12.4   |
| tasks      | 1   | 12.2 | 17.2 | 21.6  | 22.7   |
| tasks      | 2   | 11.8 | 16.5 | 22.1  | 23.8   |
| readiness  | 1   | 13.6 | 19.6 | 25.5  | 28.6   |
| readiness  | 2   | 18.0 | 24.3 | 41.5  | 65.9   |

All values milliseconds.

## Reading guidance (quantitative-targets)

- Run 1 `events` p95/max is environmental noise (first-run JIT + cold page cache
  on this workstation), not implementation signal: run 2 on identical code shows
  p95 11.8 / max 12.4. Single-run tail numbers must not be quoted.
- Tasks/readiness are stable across runs (p50 within ~5 ms); events p50 differs
  run-over-run (30.7 vs 8.5) for the same noise reason — report the range, not
  a point value.
- These numbers measure the two-phase-read implementation (narrow phase-1 +
  hydrated page). They still say nothing about production (Turso latency, real
  parish scale, concurrent writers) or about client-perceived latency.
- Re-measure on CI-standard hardware before any B1'-style optimization claim,
  and never compare p50 here against §18 p95 there (aggregation mismatch).
