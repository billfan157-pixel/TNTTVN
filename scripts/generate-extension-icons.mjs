import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const table = new Uint32Array(256)
for (let i = 0; i < 256; i++) {
  let c = i
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
  }
  table[i] = c
}

function crc32(buf) {
  let crc = 0 ^ (-1)
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff]
  }
  return (crc ^ (-1)) >>> 0
}

function createChunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const t = Buffer.from(type, 'ascii')
  const body = Buffer.concat([t, data])
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crcBuf])
}

function generatePng(size) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // 8 bit per channel
  ihdr[9] = 6 // RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0

  const raw = []
  const radius = size * 0.22
  const cx = size / 2
  const cy = size / 2

  for (let y = 0; y < size; y++) {
    raw.push(0) // PNG filter type 0 (None)
    for (let x = 0; x < size; x++) {
      // Rounded rect boundary
      const dx = Math.max(0, Math.abs(x + 0.5 - cx) - (size / 2 - radius))
      const dy = Math.max(0, Math.abs(y + 0.5 - cy) - (size / 2 - radius))
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist > radius) {
        raw.push(0, 0, 0, 0) // transparent outside corners
        continue
      }

      // Background: Catevia Pine Green #1e6f59 (30, 111, 89)
      let r = 30, g = 111, b = 89, a = 255

      // Inner Attendance Pad / Card
      const pad = size * 0.20
      if (x >= pad && x < size - pad && y >= pad && y < size - pad) {
        // card body: soft crisp white
        r = 255; g = 255; b = 255

        // Draw horizontal list stripes
        const barX1 = pad + size * 0.12
        const barX2 = size - pad - size * 0.12
        const barH = Math.max(1, Math.round(size * 0.08))
        const y1 = Math.round(pad + size * 0.18)
        const y2 = Math.round(pad + size * 0.32)
        const y3 = Math.round(pad + size * 0.46)

        if (x >= barX1 && x <= barX2) {
          if (y >= y1 && y < y1 + barH) { r = 46; g = 160; b = 120 }
          else if (y >= y2 && y < y2 + barH) { r = 46; g = 160; b = 120 }
          else if (y >= y3 && y < y3 + barH) { r = 160; g = 175; b = 170 }
        }

        // Checkmark badge in front of line 1
        const chkX = barX1 - size * 0.04
        if (x >= chkX - 2 && x <= chkX && y >= y1 && y < y1 + barH) {
          r = 30; g = 180; b = 110
        }
      }

      // Top clip: Amber / Gold accent #e08e00 (224, 142, 0)
      const clipW = size * 0.24
      const clipH = size * 0.10
      if (x >= cx - clipW / 2 && x <= cx + clipW / 2 && y >= pad - clipH / 2 && y <= pad + clipH / 2) {
        r = 224; g = 142; b = 0
      }

      raw.push(r, g, b, a)
    }
  }

  const compressed = zlib.deflateSync(Buffer.from(raw))
  const idat = createChunk('IDAT', compressed)
  const ihdrChunk = createChunk('IHDR', ihdr)
  const iend = createChunk('IEND', Buffer.alloc(0))

  return Buffer.concat([sig, ihdrChunk, idat, iend])
}

const targetDir = path.resolve('tools/tini-dom-export/icons')
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true })
}

for (const size of [16, 32, 48, 128]) {
  const png = generatePng(size)
  const dest = path.join(targetDir, `icon${size}.png`)
  fs.writeFileSync(dest, png)
  console.log(`Generated ${dest} (${size}x${size}, ${png.length} bytes)`)
}
