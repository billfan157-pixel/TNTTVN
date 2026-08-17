/**
 * Code128 Barcode Generator — lightweight SVG-only implementation.
 * Supports full ASCII (Code128B set). Used as backup identification on answer sheets.
 * No external dependencies — pure pattern lookup + SVG rendering.
 */

// Code128B character set: ASCII 32–127 mapped to pattern indices 0–95
const CODE128_PATTERNS: string[] = [
  '11011001100', '11001101100', '11001100110', '10010011000', '10010001100',
  '10001001100', '10011001000', '10011000100', '10001100100', '11001001000',
  '11001000100', '11000100100', '10110011100', '10011011100', '10011001110',
  '10111001100', '10011101100', '10011100110', '11001110010', '11001011100',
  '11001001110', '11011100100', '11001110100', '11101101110', '11101001100',
  '11100101100', '11100100110', '11101100100', '11100110100', '11100110010',
  '11011011000', '11011000110', '11000110110', '10100011000', '10001011000',
  '10001000110', '10110001000', '10001101000', '10001100010', '11010001000',
  '11000101000', '11000100010', '10110111000', '10110001110', '10001101110',
  '10111011000', '10111000110', '10001110110', '11101110110', '11010001110',
  '11000101110', '11011101000', '11011100010', '11011101110', '11101011000',
  '11101000110', '11100010110', '11101101000', '11101100010', '11100011010',
  '11101111010', '11001000010', '11110001010', '10100110000', '10100001100',
  '10010110000', '10010000110', '10000101100', '10000100110', '10110010000',
  '10110000100', '10011010000', '10011000010', '10000110100', '10000110010',
  '11000010010', '11001010000', '11110111010', '11000010100', '10001111010',
  '10100111100', '10010111100', '10010011110', '10111100100', '10011110100',
  '10011110010', '11110100100', '11110010100', '11110010010', '11011011110',
  '11011110110', '11110110110', '10101111000', '10100011110', '10001011110',
  '10111101000', '10111100010', '11110101000', '11110100010', '10111011110',
  '10111101110', '11101011110', '11110101110', '11010000100', '11010010000',
  '11010011100', '11000111010',
]

const START_CODE_B = 104 // Start with Code128B
const STOP_PATTERN = '1100011101011' // 2-module bar + stop

/** Encode text to Code128B barcode pattern (SVG-ready array of 0/1). */
function encodeCode128(text: string): string {
  // Truncate to 80 chars max (Code128 practical limit for print)
  const s = text.slice(0, 80)
  let checksum = START_CODE_B
  let pattern = CODE128_PATTERNS[START_CODE_B]

  for (let i = 0; i < s.length; i++) {
    const charCode = s.charCodeAt(i) - 32 // Code128B offset
    if (charCode < 0 || charCode > 95) continue
    checksum += charCode * (i + 1)
    pattern += CODE128_PATTERNS[charCode]
  }

  checksum = checksum % 103
  pattern += CODE128_PATTERNS[checksum]
  pattern += STOP_PATTERN

  return pattern
}

/** Generate Code128 barcode as SVG string. */
export function generateBarcodeSvg(text: string, height = 40, barWidth = 1.5): string {
  const pattern = encodeCode128(text)
  const totalBars = pattern.length
  // Code128 cần quiet zone tối thiểu khoảng 10 module ở mỗi phía để camera tách
  // barcode khỏi chữ/đường viền lân cận.
  const quietZone = 10 * barWidth
  const svgWidth = totalBars * barWidth + quietZone * 2

  let bars = ''
  for (let i = 0; i < totalBars; i++) {
    if (pattern[i] === '1') {
      bars += `<rect x="${quietZone + i * barWidth}" y="0" width="${barWidth}" height="${height}" fill="#000" />`
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${height}" width="${svgWidth}" height="${height}">${bars}</svg>`
}

/** Chiều rộng viewBox SSOT để nhúng barcode mà không cắt payload dài. */
export function getBarcodeViewBoxWidth(text: string, barWidth = 1.5): number {
  return encodeCode128(text).length * barWidth + 20 * barWidth
}

// ─── Code128 Decoder ─────────────────────────────────────────────────────────

/** Reverse lookup: pattern string → value (0–106). */
const PATTERN_TO_VALUE = new Map<string, number>()
CODE128_PATTERNS.forEach((pat, idx) => PATTERN_TO_VALUE.set(pat, idx))

/** Decode Code128B: value → ASCII char. */
function valueToChar(v: number): string | null {
  // Code128B value 0..95 ánh xạ ASCII 32..127. Bản cũ coi value là ASCII trực
  // tiếp nên mọi payload sinh bởi chính encoder đều bị giải mã sai.
  if (v >= 0 && v <= 95) return String.fromCharCode(v + 32)
  return null
}

/**
 * Decode barcode from horizontal run-lengths.
 * Input: array of run lengths [black, white, black, white, ...].
 * Returns decoded string or null if invalid.
 */
export function decodeCode128(runs: number[]): string | null {
  if (runs.length < 10) return null

  // Module cơ sở là run ngắn nhất; các run Code128 còn lại là bội 2–4 module.
  const allRuns = runs.filter(r => r > 0)
  if (allRuns.length < 6) return null
  const sorted = [...allRuns].sort((a, b) => a - b)
  const shortestCount = Math.max(1, Math.ceil(sorted.length * 0.2))
  const moduleWidth = sorted.slice(0, shortestCount).reduce((s, v) => s + v, 0) / shortestCount

  // Quantize runs to 1–6 modules
  const quantized = runs.map(r => Math.max(1, Math.round(r / moduleWidth)))

  // Convert quantized runs to binary pattern string
  let pattern = ''
  for (let i = 0; i < quantized.length; i++) {
    const bit = i % 2 === 0 ? '1' : '0' // starts with black
    pattern += bit.repeat(quantized[i])
  }

  // Each Code128 symbol = 11 modules. Strip quiet zone (leading zeros)
  pattern = pattern.replace(/^0+/, '')
  if (pattern.length < 11) return null

  // Stop dài 13 module, không phải một symbol 11 module. Bản cũ cắt stop thành
  // 11 module rồi lấy nhầm ký tự dữ liệu cuối làm checksum nên raster hợp lệ
  // cũng luôn decode thất bại.
  if (!pattern.endsWith(STOP_PATTERN)) return null
  const body = pattern.slice(0, -STOP_PATTERN.length)
  if (body.length % 11 !== 0) return null

  // Extract 11-module symbols: start + data + checksum.
  const symbols: string[] = []
  let pos = 0
  while (pos + 11 <= body.length && symbols.length < 107) {
    symbols.push(body.slice(pos, pos + 11))
    pos += 11
  }

  if (symbols.length < 3) return null // start + at least 1 char + checksum

  // Decode start symbol
  const startVal = PATTERN_TO_VALUE.get(symbols[0])
  if (startVal !== START_CODE_B) return null

  // Decode data characters
  let checksum = startVal
  let result = ''
  for (let i = 1; i < symbols.length - 1; i++) {
    const val = PATTERN_TO_VALUE.get(symbols[i])
    if (val === undefined) return null
    const ch = valueToChar(val)
    if (ch === null) return null
    result += ch
    checksum += val * i
  }

  // Verify checksum
  const checkVal = PATTERN_TO_VALUE.get(symbols[symbols.length - 1])
  if (checkVal === undefined) return null
  if (checksum % 103 !== checkVal) return null

  return result
}

/**
 * Detect barcode from image data (canvas context).
 * Scans horizontal line at y-position, finds black/white transitions.
 */
export function detectBarcodeFromImageData(
  imageData: ImageData,
  y?: number
): string | null {
  const { width, height, data } = imageData
  // Quét cả vùng trên (QR vùng giữa/góc phải) và dải CUỐI phiếu nơi barcode
  // được in full-width (y sheet ≈ 0.955). Frame camera luôn có lề nền quanh A4
  // nên vị trí dải trong frame thay đổi theo độ zoom (0.6–1.0 chiều cao) → quét
  // dày 2% ở nửa dưới; bar cao ~2% phiếu nên luôn có scanline xuyên qua.
  const rows = y === undefined
    ? [
        ...Array.from({ length: 13 }, (_, i) => Math.round(height * (0.08 + i * 0.04))),
        ...Array.from({ length: 20 }, (_, i) => Math.round(height * (0.60 + i * 0.02))),
      ]
    : [Math.max(0, Math.min(height - 1, Math.round(y)))]

  for (const scanY of rows) {
    const line: number[] = []
    for (let x = 0; x < width; x++) {
      const idx = (scanY * width + x) * 4
      const gray = data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114
      line.push(gray < 128 ? 1 : 0)
    }

    // Cắt quiet zone trước/sau để run đầu tiên chắc chắn là thanh đen.
    const firstBlack = line.indexOf(1)
    const lastBlack = line.lastIndexOf(1)
    if (firstBlack < 0 || lastBlack <= firstBlack) continue
    const runs: number[] = []
    let current = 1
    let count = 0
    for (let x = firstBlack; x <= lastBlack; x++) {
      const pixel = line[x]
      if (pixel === current) count++
      else {
        runs.push(count)
        current = pixel
        count = 1
      }
    }
    runs.push(count)
    const decoded = decodeCode128(runs)
    if (decoded) return decoded
  }
  return null
}
