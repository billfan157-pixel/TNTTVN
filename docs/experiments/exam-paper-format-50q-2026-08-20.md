# 50-question exam paper format redesign — 2026-08-20

## Problem observed

A real print-preview screenshot of a 50-question integrated exam showed the OMR answer grid extending beyond the right homography frame. The printed 4-marker frame itself remained in place, but the eighth CSS Grid track was widened by min-content from the question label plus four 16px bubbles.

## Root causes

1. Integrated OMR uses 8 columns for 21–50 questions. Each grid cell contains a fixed question label plus four fixed-size bubbles.
2. CSS used `repeat(8, 1fr)`. CSS Grid treats `1fr` as having an automatic min-content floor, so the track may refuse to shrink to 1/8 of the available frame and the grid can overflow.
3. `.grid-q-row` used flex layout. The fixed bubble group and fixed question label participated in min-content sizing, reinforcing the overflow.
4. The paper header declared widths of 40% + 46% + 20% = 106%, forcing browser/print-driver dependent shrinking.
5. Other two-column grids also used plain `1fr`, allowing long option text to influence minimum track width.

## Production redesign

The redesign deliberately keeps the existing V3 OMR geometry and QR protocol:

- Keep 5 integrated columns for <=20 questions and 8 columns for 21–50 questions.
- Keep marker size, bubble size, bubble gaps, row height and all detector formulas unchanged.
- Use `minmax(0, 1fr)` for integrated grid tracks so tracks obey the homography frame width.
- Position the question label and bubble group absolutely inside each OMR row. The bubble group is anchored to the row content-box right edge, matching `integratedMcOptionToCellForRect()`.
- Shorten the visible OMR row label to the numeric question index so it cannot compete with bubble width.
- Replace the over-constrained header with a finite CSS Grid layout.
- Allow OMR instructions to wrap instead of forcing one long line.
- Use `minmax(0, 1fr)` and safe wrapping in question option grids.

## Compatibility

This change does not alter printed bubble centers or the integrated homography marker geometry. Existing V3 QR payloads and detector calculations remain valid.

## Regression gate

Chromium print-media tests now assert that, for every boundary question count including 21, 30, 31, 49 and 50:

- the integrated grid stays within `.omr-frame`;
- every question row stays within `.omr-frame`;
- every bubble stays within `.omr-frame`;
- bubble centers still match detector coordinates within the existing tolerance;
- the 50-question representative PDF still renders successfully.
