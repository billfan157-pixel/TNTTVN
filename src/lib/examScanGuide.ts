import { integratedFrameAspectRatio } from './answerSheetTemplate'

/**
 * Camera alignment target for the integrated OMR strip.
 *
 * The production-engine benchmark showed that pushing the strip toward the
 * horizontal edges increases fiducial misses. Keep the marker-center frame at
 * ~86% of the portrait viewport width and move its center upward so the top
 * markers sit comfortably inside the integrated locator's y band.
 *
 * These constants affect only the camera alignment overlay. They do NOT change
 * printed V3 geometry, bubble coordinates, homography, or detector bands.
 */
export const INTEGRATED_SCAN_GUIDE_WIDTH_FRACTION = 0.86
export const INTEGRATED_SCAN_GUIDE_CENTER_Y_FRACTION = 0.42

export interface IntegratedScanGuideLayout {
  widthFraction: number
  centerYFraction: number
  aspectRatio: number
}

export interface IntegratedScanGuideRect {
  x: number
  y: number
  width: number
  height: number
}

export function getIntegratedScanGuideLayout(questionCount: number): IntegratedScanGuideLayout {
  return {
    widthFraction: INTEGRATED_SCAN_GUIDE_WIDTH_FRACTION,
    centerYFraction: INTEGRATED_SCAN_GUIDE_CENTER_Y_FRACTION,
    aspectRatio: integratedFrameAspectRatio(questionCount),
  }
}

/**
 * Pixel rect represented by the overlay when the camera viewport is known.
 * Exported for regression tests and diagnostics so CSS placement cannot drift
 * away from the detector-safe target silently.
 */
export function getIntegratedScanGuideRect(
  viewportWidth: number,
  viewportHeight: number,
  questionCount: number,
): IntegratedScanGuideRect {
  if (!(viewportWidth > 0) || !(viewportHeight > 0)) {
    throw new Error('Camera viewport must have positive dimensions')
  }
  const layout = getIntegratedScanGuideLayout(questionCount)
  const width = viewportWidth * layout.widthFraction
  const height = width / layout.aspectRatio
  return {
    x: (viewportWidth - width) / 2,
    y: viewportHeight * layout.centerYFraction - height / 2,
    width,
    height,
  }
}
