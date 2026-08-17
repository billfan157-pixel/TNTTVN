export interface SourceRect {
  sx: number
  sy: number
  sw: number
  sh: number
}

/**
 * Vùng source thật sự hiển thị bởi CSS `object-fit: cover`.
 * Scanner phải xử lý đúng vùng này; quét toàn sensor landscape trong khi overlay
 * portrait làm QR nhỏ đi 2–3 lần và khiến hướng dẫn căn giấy không còn đúng.
 */
export function getObjectCoverSourceRect(
  sourceWidth: number,
  sourceHeight: number,
  displayWidth: number,
  displayHeight: number
): SourceRect {
  if (sourceWidth <= 0 || sourceHeight <= 0 || displayWidth <= 0 || displayHeight <= 0) {
    return { sx: 0, sy: 0, sw: Math.max(1, sourceWidth), sh: Math.max(1, sourceHeight) }
  }
  const sourceAspect = sourceWidth / sourceHeight
  const displayAspect = displayWidth / displayHeight
  if (sourceAspect > displayAspect) {
    const sw = sourceHeight * displayAspect
    return { sx: (sourceWidth - sw) / 2, sy: 0, sw, sh: sourceHeight }
  }
  const sh = sourceWidth / displayAspect
  return { sx: 0, sy: (sourceHeight - sh) / 2, sw: sourceWidth, sh }
}
