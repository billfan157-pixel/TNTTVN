export type ScanQualityStatus = 'good' | 'review' | 'bad'

export interface ScanQualityAssessment {
  status: ScanQualityStatus
  meanLuma: number
  highlightRatio: number
  shadowRatio: number
  edgeEnergy: number
  reasons: Array<'TOO_DARK' | 'TOO_BRIGHT' | 'GLARE' | 'LOW_DETAIL'>
}

/**
 * Chỉ lưu số đo tổng hợp, không lưu ảnh hay pixel.
 *
 * Contract với scanAcceptancePolicy:
 * - good: có thể auto-accept nếu OMR cũng accepted;
 * - review: bắt buộc người chấm rà soát;
 * - bad: hard reject, không được ghi điểm từ frame đó.
 *
 * Detector marker/OMR vẫn là gate độc lập; quality không thể biến một OMR lỗi
 * thành kết quả hợp lệ.
 */
export function assessScanQuality(image: ImageData): ScanQualityAssessment {
  const { width, height, data } = image
  const step = Math.max(1, Math.floor(Math.min(width, height) / 240))
  let count = 0
  let lumaSum = 0
  let highlights = 0
  let shadows = 0
  let edgeSum = 0

  for (let y = step; y < height; y += step) {
    for (let x = step; x < width; x += step) {
      const index = (y * width + x) * 4
      const leftIndex = (y * width + x - step) * 4
      const topIndex = ((y - step) * width + x) * 4
      const luma = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114
      const left = data[leftIndex] * 0.299 + data[leftIndex + 1] * 0.587 + data[leftIndex + 2] * 0.114
      const top = data[topIndex] * 0.299 + data[topIndex + 1] * 0.587 + data[topIndex + 2] * 0.114
      lumaSum += luma
      edgeSum += (Math.abs(luma - left) + Math.abs(luma - top)) / 2
      if (luma >= 250) highlights++
      if (luma <= 18) shadows++
      count++
    }
  }

  const meanLuma = count ? lumaSum / count : 0
  const highlightRatio = count ? highlights / count : 0
  const shadowRatio = count ? shadows / count : 0
  const edgeEnergy = count ? edgeSum / count : 0
  const reasons: ScanQualityAssessment['reasons'] = []
  if (meanLuma < 45) reasons.push('TOO_DARK')
  if (meanLuma > 242) reasons.push('TOO_BRIGHT')
  if (highlightRatio > 0.22) reasons.push('GLARE')
  if (edgeEnergy < 3) reasons.push('LOW_DETAIL')

  const status: ScanQualityStatus = meanLuma < 25 || meanLuma > 250 || edgeEnergy < 1
    ? 'bad'
    : reasons.length > 0
      ? 'review'
      : 'good'

  return {
    status,
    meanLuma: Math.round(meanLuma * 10) / 10,
    highlightRatio: Math.round(highlightRatio * 1000) / 1000,
    shadowRatio: Math.round(shadowRatio * 1000) / 1000,
    edgeEnergy: Math.round(edgeEnergy * 10) / 10,
    reasons,
  }
}