# Integrated OMR camera guide placement — 2026-08-19

This note records the production decision derived from the temporary benchmark PR #6. The benchmark branch was intentionally closed without merge.

## Production-engine synthetic benchmark

The benchmark rendered real integrated exam sheets with the app renderer and evaluated them through the production OMR/quality/acceptance pipeline under clean, blur, rotation, and offset perturbations.

Exact-score success observed in the benchmark:

| Layout | 20 questions | 50 questions |
| --- | ---: | ---: |
| Current effective width ~86%, centerY 50% | 12.5% | 50.0% |
| Enlarged portrait ~96%, centerY 50% | 0% | 0% |
| Wide 1280×960 model, width 90% | 0% | 0% |
| Width ~86%, centerY 42% | 62.5% | 62.5% |
| Width 88%, centerY 42% | 25.0% | 25.0% |
| Width 90%, centerY 42% | 0% | 0% |

For the 20-question sheet, moving the guide from centerY 50% to 42% while retaining its width improved detector `ok` from 12.5% to 75.0% and average confidence from about 0.0305 to 0.2091 in this synthetic stress set. For 50 questions, detector `ok` improved from 75.0% to 87.5%.

## Decision

Use a stable integrated guide width of 86% of the portrait camera viewport and center it at 42% of viewport height. Do not enlarge it toward the horizontal edges with the current locator.

This is an alignment-overlay change only. It does not change printed V3 geometry, bubble coordinates, homography, or detector bands.

## Limits

These numbers are comparative synthetic benchmark results, not claimed real-world field accuracy. Real-device validation with printed sheets remains required before publishing a first-capture-rate claim.
