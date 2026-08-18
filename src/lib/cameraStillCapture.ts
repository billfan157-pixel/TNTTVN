import { getObjectCoverSourceRect } from './cameraFrame'

/**
 * Chụp lại đúng vùng camera đang hiển thị nhưng ở độ phân giải sensor cao hơn
 * preview phân tích liên tục. Hoạt động trên cả iOS Safari vì không phụ thuộc
 * ImageCapture API; caller có thể fallback frame cũ nếu browser từ chối canvas.
 */
export function captureHighResolutionVideoFrame(
  video: HTMLVideoElement,
  maxSide = 2200,
): ImageData | null {
  if (video.readyState < 2 || video.videoWidth <= 0 || video.videoHeight <= 0) return null
  const display = video.getBoundingClientRect()
  const source = getObjectCoverSourceRect(
    video.videoWidth,
    video.videoHeight,
    display.width || 3,
    display.height || 4,
  )
  const scale = Math.min(1, maxSide / Math.max(source.sw, source.sh))
  const width = Math.max(1, Math.round(source.sw * scale))
  const height = Math.max(1, Math.round(source.sh * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return null
  context.drawImage(video, source.sx, source.sy, source.sw, source.sh, 0, 0, width, height)
  return context.getImageData(0, 0, width, height)
}

interface ImageCaptureLike {
  takePhoto: () => Promise<Blob>
}

/**
 * Ưu tiên ảnh tĩnh full-resolution trên Chromium/Android; iOS Safari chưa có
 * ImageCapture nên tự động fallback về frame video hiện tại.
 */
export async function captureHighResolutionCameraFrame(
  video: HTMLVideoElement,
  track: MediaStreamTrack | undefined,
  maxSide = 2200,
): Promise<ImageData | null> {
  const ImageCaptureConstructor = (globalThis as typeof globalThis & {
    ImageCapture?: new (track: MediaStreamTrack) => ImageCaptureLike
  }).ImageCapture
  if (track && ImageCaptureConstructor && typeof createImageBitmap === 'function') {
    try {
      const blob = await new ImageCaptureConstructor(track).takePhoto()
      const bitmap = await createImageBitmap(blob)
      try {
        const display = video.getBoundingClientRect()
        const source = getObjectCoverSourceRect(
          bitmap.width,
          bitmap.height,
          display.width || 3,
          display.height || 4,
        )
        const scale = Math.min(1, maxSide / Math.max(source.sw, source.sh))
        const width = Math.max(1, Math.round(source.sw * scale))
        const height = Math.max(1, Math.round(source.sh * scale))
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext('2d', { willReadFrequently: true })
        if (context) {
          context.drawImage(bitmap, source.sx, source.sy, source.sw, source.sh, 0, 0, width, height)
          return context.getImageData(0, 0, width, height)
        }
      } finally {
        bitmap.close()
      }
    } catch {
      // Fallback bên dưới: browser/track có thể khai báo API nhưng từ chối takePhoto.
    }
  }
  return captureHighResolutionVideoFrame(video, maxSide)
}
