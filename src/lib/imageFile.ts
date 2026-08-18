/** Đọc một file ảnh và co cạnh dài về giới hạn để tránh giữ bitmap quá lớn. */
export async function imageFileToImageData(file: File, maxSide = 1800): Promise<ImageData> {
  const bitmap = typeof createImageBitmap === 'function' ? await createImageBitmap(file) : null
  if (bitmap) {
    try {
      const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
      const width = Math.max(1, Math.round(bitmap.width * scale))
      const height = Math.max(1, Math.round(bitmap.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) throw new Error('Không khởi tạo được bộ xử lý ảnh.')
      context.drawImage(bitmap, 0, 0, width, height)
      return context.getImageData(0, 0, width, height)
    } finally {
      bitmap.close()
    }
  }

  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('Không đọc được file ảnh.'))
    })
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight))
    const width = Math.max(1, Math.round(image.naturalWidth * scale))
    const height = Math.max(1, Math.round(image.naturalHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('Không khởi tạo được bộ xử lý ảnh.')
    context.drawImage(image, 0, 0, width, height)
    return context.getImageData(0, 0, width, height)
  } finally {
    URL.revokeObjectURL(url)
  }
}
