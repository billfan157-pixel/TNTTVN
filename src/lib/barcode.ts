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
  const svgWidth = totalBars * barWidth + 2 // +2 for quiet zone
  const quietZone = 1

  let bars = ''
  for (let i = 0; i < totalBars; i++) {
    if (pattern[i] === '1') {
      bars += `<rect x="${quietZone + i * barWidth}" y="0" width="${barWidth}" height="${height}" fill="#000" />`
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${height}" width="${svgWidth}" height="${height}">${bars}</svg>`
}

// ─── Code128 Decoder ─────────────────────────────────────────────────────────

/** Reverse lookup: pattern string → value (0–106). */
const PATTERN_TO_VALUE = new Map<string, number>()
CODE128_PATTERNS.forEach((pat, idx) => PATTERN_TO_VALUE.set(pat, idx))

/** Decode Code128B: value → ASCII char. */
function valueToChar(v: number): string | null {
  if (v >= 32 && v <= 126) return String.fromCharCode(v)
  return null
}

/**
 * Decode barcode from horizontal run-lengths.
 * Input: array of run lengths [black, white, black, white, ...].
 * Returns decoded string or null if invalid.
 */
export function decodeCode128(runs: number[]): string | null {
  if (runs.length < 10) return null

  // Calculate module width from first few runs (average of shortest bars)
  const allRuns = runs.filter(r => r > 0)
  if (allRuns.length < 6) return null
  const sorted = [...allRuns].sort((a, b) => a - b)
  const moduleWidth = sorted.slice(0, Math.floor(sorted.length / 2)).reduce((s, v) => s + v, 0) / Math.floor(sorted.length / 2)

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

  // Extract 11-module symbols
  const symbols: string[] = []
  let pos = 0
  while (pos + 11 <= pattern.length && symbols.length < 107) {
    symbols.push(pattern.slice(pos, pos + 11))
    pos += 11
  }

  if (symbols.length < 4) return null // start + at least 1 char + checksum + stop

  // Decode start symbol
  const startVal = PATTERN_TO_VALUE.get(symbols[0])
  if (startVal === undefined || startVal < 96 || startVal > 106) return null // must be Code128B start (104)

  // Decode data characters
  let checksum = startVal
  let result = ''
  for (let i = 1; i < symbols.length - 2; i++) {
    const val = PATTERN_TO_VALUE.get(symbols[i])
    if (val === undefined) return null
    const ch = valueToChar(val)
    if (ch === null) return null
    result += ch
    checksum += val * i
  }

  // Verify checksum
  const checkVal = PATTERN_TO_VALUE.get(symbols[symbols.length - 3])
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
  const scanY = y ?? Math.floor(height / 2)

  // Read one horizontal line
  const line: number[] = []
  for (let x = 0; x < width; x++) {
    const idx = (scanY * width + x) * 4
    const r = data[idx]
    const g = data[idx + 1]
    const b = data[idx + 2]
    // Convert to grayscale and threshold
    const gray = (r * 0.299 + g * 0.587 + b * 0.114)
    line.push(gray < 128 ? 1 : 0) // 1 = black, 0 = white
  }

  // Find runs of same color
  const runs: number[] = []
  let current = line[0]
  let count = 0
  for (const pixel of line) {
    if (pixel === current) {
      count++
    } else {
      runs.push(count)
      current = pixel
      count = 1
    }
  }
  runs.push(count)

  return decodeCode128(runs)
}
