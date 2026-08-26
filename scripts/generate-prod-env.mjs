import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

function generateHex(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex')
}

console.log('🔑 Đang sinh các mã bảo mật ngẫu nhiên chuẩn quân sự cho môi trường Production...')

const jwtSecret = generateHex(32)
const jwtRefreshSecret = generateHex(32)
const backupEncryptionKey = generateHex(32)
const reportHmacSecret = generateHex(32)
const opsToken = generateHex(32)
const seedAdminPassword = `Parish@${crypto.randomInt(100000, 999999)}`

const envContent = `# ==============================================================================
# TNTT PARISH MANAGEMENT PLATFORM - PRODUCTION ENVIRONMENT CONFIGURATION
# Generated automatically on: ${new Date().toISOString()}
# ==============================================================================

NODE_ENV=production
PORT=3001
HOST=0.0.0.0

# ─── BẢO MẬT XÁC THỰC (BẮT BUỘC) ───
# Secret signing JWT token (HMAC-SHA256)
JWT_SECRET=${jwtSecret}

# Secret signing Refresh token (BẮT BUỘC khác JWT_SECRET)
JWT_REFRESH_SECRET=${jwtRefreshSecret}

# Khóa AES-256-GCM cho backup logic Turso (64 ký tự hex)
BACKUP_ENCRYPTION_KEY=${backupEncryptionKey}

# SEC-HMAC-1 (2026-08-24): BẮT BUỘC — secret riêng ký HMAC QR phiếu điểm (64 hex).
# Production thiếu biến này → server fail-closed khi khởi động.
REPORT_HMAC_SECRET=${reportHmacSecret}

# Token bảo vệ endpoint giám sát hệ thống (/metrics, /ready)
OPS_TOKEN=${opsToken}

# ─── CƠ SỞ DỮ LIỆU & LƯU TRỮ ───
# Đường dẫn file SQLite database trên máy chủ / persistent volume
DB_PATH=/app/data/parish.db

# Thư mục lưu trữ các bản sao lưu tự động hàng ngày
BACKUP_DIR=/app/backups

# Tin tưởng reverse proxy (BẬT khi chạy sau Nginx / Cloudflare / Railway proxy)
TRUST_PROXY=true

# ─── TÊN MIỀN & CORS ORIGIN ───
# Danh sách domain frontend được phép gọi API (phân tách bởi dấu phẩy)
# Ví dụ: https://tntt.giahop.org,https://tnttvn.vercel.app
CLIENT_ORIGIN=https://tnttvn.vercel.app

# ─── KHỞI TẠO TÀI KHOẢN ADMIN BAN ĐẦU ───
# Mật khẩu khởi tạo admin khi DB trống (chỉ dùng lần đầu tiên)
SEED_ADMIN_PASSWORD=${seedAdminPassword}

# ─── TÍCH HỢP TELEGRAM (TÙY CHỌN) ───
# TELEGRAM_BOT_TOKEN=your_bot_token_here
# TELEGRAM_BOT_USERNAME=your_bot_username_here
# TELEGRAM_ADMIN_CHAT_ID=your_chat_id_here
`

const targetPath = path.join(rootDir, '.env.production')
fs.writeFileSync(targetPath, envContent, 'utf-8')

console.log(`✅ Đã tạo thành công file cấu hình: .env.production`)
console.log(`--------------------------------------------------`)
console.log(`🔐 Mật khẩu Admin khởi tạo ban đầu: ${seedAdminPassword}`)
console.log(`   (Tài khoản mặc định: admin / ${seedAdminPassword})`)
console.log(`--------------------------------------------------`)
