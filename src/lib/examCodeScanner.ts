import jsQR from 'jsqr'
import { detectBarcodeFromImageData } from './barcode'
import { parseExamQrPayload } from './qr'

export interface ExamCodeScanResult {
  rawText: string | null
  payload: { sessionId: string; studentId: string } | null
  source: 'qr' | 'barcode' | null
}

function cropImageData(
  image: ImageData,
  xRatio: number,
  yRatio: number,
  widthRatio: number,
  heightRatio: number
): { data: Uint8ClampedArray; width: number; height: number } {
  const x0 = Math.max(0, Math.floor(image.width * xRatio))
  const y0 = Math.max(0, Math.floor(image.height * yRatio))
  const width = Math.max(1, Math.min(image.width - x0, Math.ceil(image.width * widthRatio)))
  const height = Math.max(1, Math.min(image.height - y0, Math.ceil(image.height * heightRatio)))
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    const sourceStart = ((y0 + y) * image.width + x0) * 4
    data.set(image.data.subarray(sourceStart, sourceStart + width * 4), y * width * 4)
  }
  return { data, width, height }
}

function upscaleNearest(
  image: { data: Uint8ClampedArray; width: number; height: number },
  scale: number
): { data: Uint8ClampedArray; width: number; height: number } {
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    const sourceY = Math.min(image.height - 1, Math.floor(y / scale))
    for (let x = 0; x < width; x++) {
      const sourceX = Math.min(image.width - 1, Math.floor(x / scale))
      const source = (sourceY * image.width + sourceX) * 4
      const target = (y * width + x) * 4
      data[target] = image.data[source]
      data[target + 1] = image.data[source + 1]
      data[target + 2] = image.data[source + 2]
      data[target + 3] = image.data[source + 3]
    }
  }
  return { data, width, height }
}

/**
 * Đọc định danh phiếu theo thứ tự QR → barcode. Ngoài toàn frame, thử thêm vùng
 * nửa trên/phải nơi mã được in để giảm nhiễu chữ và bubble trên ảnh điện thoại.
 * rawText khác null nhưng payload null nghĩa là đã đọc được một mã không hợp lệ.
 */
export function scanExamCode(image: ImageData): ExamCodeScanResult {
  const upperRight = cropImageData(image, 0.42, 0, 0.58, 0.55)
  // Raw camera thường landscape trong khi UI portrait: A4 nằm giữa frame và QR
  // rơi vào x≈0.52..0.70. Crop hẹp + upscale nearest giữ cạnh module sắc nét.
  const landscapePaperQr = cropImageData(image, 0.48, 0, 0.28, 0.38)
  const qrAttempts = [
    { data: image.data, width: image.width, height: image.height },
    upperRight,
    landscapePaperQr,
    upscaleNearest(landscapePaperQr, 2),
    cropImageData(image, 0, 0, 1, 0.48),
  ]

  for (const attempt of qrAttempts) {
    const decoded = jsQR(attempt.data, attempt.width, attempt.height, { inversionAttempts: 'attemptBoth' })
    if (!decoded?.data) continue
    return { rawText: decoded.data, payload: parseExamQrPayload(decoded.data), source: 'qr' }
  }

  const barcodeText = detectBarcodeFromImageData(image)
  if (barcodeText) {
    return { rawText: barcodeText, payload: parseExamQrPayload(barcodeText), source: 'barcode' }
  }
  return { rawText: null, payload: null, source: null }
}
