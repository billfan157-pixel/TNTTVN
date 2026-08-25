# DEPLOYMENT & INFRASTRUCTURE OPERATIONS GUIDE - PARISH LMS v2.0

Document Status: **APPROVED**  
Architecture Lead: Chief Architect & AI Pair Programming Agent  
Last Updated: 2026-08-24 (SEC-HMAC-1: `REPORT_HMAC_SECRET` **BẮT BUỘC production** — fail-closed startup, ký QR phiếu điểm; OBS-1: endpoint `/api/csp-report` public thu CSP violation); 2026-08-21 (ADR-051: migration + schema readiness + initial seed fail-closed; `SEED_ADMIN_PASSWORD` explicit strong bootstrap secret, no default); 2026-08-19 (A-NEW-58: production CORS default thêm origin native Capacitor — capacitor://localhost / https://localhost / http://localhost); 2026-08-16 (FE-07: PWA freshness — no-store sw.js/index.html, updateViaCache none, reload-on-activate); 2026-08-12 (Web Push §8 VAPID setup — fix production 501 `VAPID_NOT_CONFIGURED`; env table VAPID ⚠️ conditional); 2026-08-10 (A-NEW-12: CORS split dev/prod — production default CHỈ tnttvn.vercel.app; A-NEW-08: xlsx 0.20.3; A-NEW-04/01/02: refresh cookie SameSite=None;Secure ở production cho Vercel→Railway cross-site)  

---

## 1. ARCHITECTURAL CLASSIFICATION
This document is the **Canonical Single Source of Truth (SSOT)** for Docker packaging, Nginx reverse proxy configuration, automated SQLite backups, environment variables, and production operational procedures.

---

## 2. CONTAINERIZED SYSTEM ARCHITECTURE (`docker-compose.yml`)

The production deployment consists of two containerized services orchestrated via Docker Compose:

```text
Incoming HTTP/HTTPS (Port 80 / 443)
       │
       ▼
[web service] Nginx 1.27-Alpine
       ├── Static SPA Frontend Assets (Vite build)
       ├── SPA Routing Fallback (try_files $uri /index.html)
       └── Security Headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options)
       │
       │ API Requests (/api/*, /health) Proxy Pass
       ▼
[app service] Node 22-Alpine
       ├── Hono REST Server (Bound to 0.0.0.0:3001)
       ├── SQLite DB Database (@libsql/client WAL mode)
       └── Background Cron Daemon (crond running scripts/backup-db.js)
```

---

## 3. ENVIRONMENT VARIABLES SPECIFICATION

| Variable | Required | Default / Format | Description |
| :--- | :---: | :--- | :--- |
| `JWT_SECRET` | ✅ Yes | String (min 32 chars) | Secret key for JWT access token signing. **BẮT BUỘC** set trong `.env` (root) — docker-compose dùng `${JWT_SECRET:?}` fail-fast nếu thiếu |
| `JWT_REFRESH_SECRET` | ✅ Yes (production) | String (min 32 chars), **không** fallback về `JWT_SECRET` | Secret key for refresh token signing. Production startup sẽ throw nếu thiếu |
| `REPORT_HMAC_SECRET` | ✅ Yes (production) — **SEC-HMAC-1 (2026-08-24)** | String (min 32 chars, random riêng, KHÔNG tái dùng JWT_SECRET) | Secret key ký HMAC-SHA256 cho QR phiếu điểm/chứng nhận (`/api/verification/sign`). Production **fail-closed lúc startup** nếu thiếu (`hmacSigner.ts`). Verify giữ chuỗi fallback legacy (JWT_SECRET-derived) nên QR đã phát hành cũ vẫn xác thực được sau khi set secret mới. QR phát hành trước 2026-08-24 trên prod thiếu biến này đã bị ký bằng key suy dẫn từ JWT_SECRET/literal public → **bắt buộc rotate: set REPORT_HMAC_SECRET ngay khi nâng cấp**; QR cũ ký bằng literal public sẽ trở thành KHÔNG hợp lệ (đúng ý — chúng vốn có thể giả mạo bởi bất kỳ ai đọc repo) |
| `ALLOW_SEED_ADMIN_RESET` | ❌ No (deprecated) | — | **A-NEW-38 (2026-08-11): biến này KHÔNG còn được đọc** — block reset admin khi startup đã bị xóa. Xóa khỏi env để tránh nhầm lẫn |
| `HOST` | ❌ No | `0.0.0.0` | Server host binding IP |
| `PORT` | ⚠️ Railway: ⚠️ nên đọc | `3001` (fallback) | Server HTTP port — priority: `SERVER_PORT` → `PORT` → `3001` (`server/src/index.ts`). **A-NEW-49 (2026-08-17): Railway INJECT `PORT` lúc runtime (mặc định 8080) và DÙNG CHÍNH giá trị này cho healthcheck + public routing** — code phải đọc `PORT` để bind đúng cổng probe; deploy FAILED 3f6bc7e1 vì bản rewrite chỉ đọc `SERVER_PORT` → bind 3001 trong khi Railway probe 8080 → `service unavailable`. docker-compose set `PORT=3000` theo `.env.example` |
| `CLIENT_ORIGIN` | ❌ No | `https://tnttvn.vercel.app,capacitor://localhost,https://localhost,http://localhost` — **A-NEW-58 (2026-08-19): production default thêm origin native shell Capacitor** (iOS `capacitor://localhost`, Android `https://localhost`); **A-NEW-12 (2026-08-10): production default KHÔNG còn localhost dev ports** | CORS allowed origin (comma-separated, tự động trim khoảng trắng thừa). **A13 + A-NEW-12 + A-NEW-58**: allowlist CỨNG trong `server/src/utils/originPolicy.ts` — `resolveAllowedOrigins()` split theo môi trường: `NODE_ENV=production` → default `https://tnttvn.vercel.app` + 3 origin native (localhost dev ports bị loại); dev → `http://localhost:5173, http://localhost:5174, http://localhost:4173` + `https://tnttvn.vercel.app` + 3 origin native. Env này ghi đè hoàn toàn default (thêm origin production có chủ đích, ví dụ domain tĩnh riêng). Bất kỳ origin nào ngoài allowlist → phản hồi KHÔNG có `Access-Control-Allow-Origin` (từ chối). `<origin>`/`http://localhost:*` phải khớp đúng scheme+host+port (A14) — nếu dev cần origin khác, set env `CLIENT_ORIGIN` tạm |
| `DB_PATH` | ❌ No | `./data/parish.db` (relative to `server/`) | SQLite database file path (WAL mode) |
| `BACKUP_DIR` | ❌ No | `./backups` | Target directory for automated database backups |
| `TRUST_PROXY` | ⚠️ Có điều kiện | `false` | **A15 (2026-08-10)**: `getClientIp` chỉ tin `x-real-ip` / `x-forwarded-for` (giá trị cuối) khi `TRUST_PROXY=true` — **BẮT BUỘC bật khi chạy sau Nginx** (docker-compose đã set sẵn). Deploy thẳng không proxy (Railway DOCKERFILE) **KHÔNG bật** — server lấy socket IP thật, chống spoof header bypass rate limit |
| `OPS_TOKEN` | ⚠️ Có điều kiện | Empty → **fail-closed 403** | **A-NEW-28 (2026-08-11)**: token (Bearer) gate `/ready` + `/metrics` — **thiếu token → 403 (fail-closed, KHÔNG public)**; đúng token → 200. `/health` giữ public (probe dùng endpoint này). **Set trên Railway + docker-compose để mở monitoring** — nếu chưa set, chỉ mất /metrics + /ready (không ảnh hưởng healthcheck) |
| `SENTRY_DSN` | ❌ No (opt-in — OBS-2 2026-08-24) | Empty → disabled | Sentry node error aggregation phía server (`utils/observability.ts`). Thiếu DSN → hoàn toàn vô hiệu, zero overhead (console structured log + Telegram alert vẫn là kênh chính). Set DSN → capture mọi unhandled error/onError với context kỹ thuật (requestId/path — không PII, `sendDefaultPii: false`). Khuyến nghị set cùng giá trị project với client `VITE_SENTRY_DSN` để gom nhóm chéo FE/BE |
| `SENTRY_TRACES_SAMPLE_RATE` | ❌ No | `0` | Performance tracing sample rate cho Sentry node — mặc định tắt (server xử lý PII trẻ em/phụ huynh; tracing không phải mục tiêu OBS-2) |
| `SAFETY_BACKUP_DIR` | ❌ No | `{DB_PATH dir}/backups/safety` | Safety snapshot directory for destructive ops (purge) |
| `SEED_ADMIN_PASSWORD` | ⚠️ Required khi DB trống | **Không có default**; 8–128 ký tự, ≥1 chữ hoa, ≥1 chữ số, ≥1 ký tự đặc biệt | **ADR-051 (2026-08-21):** chỉ được đọc khi chạy seed ban đầu (`seedIfEmpty` trên DB chưa có user hoặc `npm run db:seed`). Fresh startup **fail-closed** nếu thiếu/yếu; tuyệt đối không fallback về credential biết trước. Khi DB đã có user, startup không dùng biến này để reset mật khẩu; seed rerun vẫn `onConflictDoNothing` cho admin. Docker Compose truyền biến từ `.env`; Railway phải set trong dashboard trước lần init DB đầu tiên. |
| `SUPER_ADMIN_ID` | ❌ No | `USR-001` | User ID bypassing role checks (super admin) |
| `VAPID_PUBLIC_KEY` | ⚠️ Có điều kiện | Empty | Web Push VAPID public key — client subscribe cần (trả qua `GET /api/notifications/vapid-public-key`); thiếu → endpoint trả 501 `VAPID_NOT_CONFIGURED`, `/send` trả 501 và queue đánh `failed` (không `sent` giả) — **fail-closed đúng thiết kế** (xem §8 Web Push Setup) |
| `VAPID_PRIVATE_KEY` | ⚠️ Có điều kiện | Empty | Web Push VAPID private key — **điều kiện**: BẮT BUỘC set cùng `VAPID_PUBLIC_KEY` nếu muốn tính năng thông báo web push hoạt động (thiếu → 501, client skip graceful) |
| `VAPID_SUBJECT` | ❌ No | `mailto:admin@giaoly.com` | VAPID contact subject (khuyến nghị đổi thành email quản trị thật của giáo xứ) |
| `PASSWORD_CIPHER_KEY` | ❌ No | Hex 64 chars (32 bytes) | Key AES-256-GCM cho `users.password_encrypted` — **chỉ mã hóa password tạm do admin đặt** (user tự đổi pass → NULL), xem lại qua `POST /api/users/:id/reveal-password` có audit (ADR-021 rewrite). **Khuyến nghị bật** ở production; thiếu → không lưu bản mã hóa, cột hiển thị "—". Giữ bí mật như JWT secret — kẻ có key + DB sẽ đọc được password tạm |
| `TELEGRAM_BOT_TOKEN` | ❌ No | String | Optional Telegram bot token for alerts |
| `TELEGRAM_ADMIN_CHAT_ID` | ❌ No | String | Admin chat ID for system alerts |
| `VITE_SENTRY_DSN` | ❌ No | URL | Frontend Sentry project DSN |

---

## 4. DOCKER MULTI-STAGE BUILD SPECIFICATION

### 4.1 Server (`Dockerfile`)
- **Base Image**: `node:22-alpine`
- **Build Stage**: Installs dependencies, compiles TypeScript (`npm run build:server`), sets `outDir: dist`.
- **Production Stage**: Runs `scripts/entrypoint.sh` which initializes environment variables for cron, executes startup backup, starts `crond`, and launches `node dist/index.js`.
- **ADR-051 startup contract**: DB migrations must complete without a non-tolerable error, executable-schema readiness must pass, and initial seed (only when DB is empty) must commit atomically before the HTTP listener/background workers start. Any failure aborts startup rather than serving a partially initialized database.

### 4.2 Web Frontend (`Dockerfile.web`)
- **Base Image**: `node:22-alpine` $\rightarrow$ `nginx:1.27-alpine`
- **Build Stage**: Runs `vite build` outputting static assets to `/app/dist`.
- **Runtime Stage**: Copies static assets to Nginx html root (`/usr/share/nginx/html`) and applies `nginx.conf`.

---

## 5. AUTOMATED SQLITE BACKUP & GRACEFUL SHUTDOWN

### 5.1 Automated Backup Script (`scripts/backup-db.js`)
- Runs daily via container cron (`crond`).
- Performs a safe copy of `parish.db` using atomic read-write streams.
- Default DB source: `server/data/parish.db` (override with `DB_PATH`); default destination `./backups` (override with `BACKUP_DIR`).
- Retention Policy: Keeps the last 5 backup copies in `BACKUP_DIR` and automatically purges older archives.

### 5.2 Graceful Shutdown Handler (`server/src/index.ts`)
- Listens for `SIGTERM` and `SIGINT` signals from Docker / Railway.
- Executes `PRAGMA wal_checkpoint(TRUNCATE)` before closing database connections to guarantee zero WAL file corruption upon container restart.

---

## 6. COMMAND QUICK REFERENCE

```bash
# Build and launch production containers
docker-compose up -d --build

# View container logs
docker-compose logs -f app

# Trigger immediate manual database backup
docker-compose exec app node scripts/backup-db.js
```

---

## 7. CURRENT DEPLOYMENT — RENDER (backend) + TURSO (DB) + VERCEL (SPA) — DEPLOY-MIGRATE 2026-08-25

> **Supersede**: Railway backend (`tnttvn-production.up.railway.app`) đã NGỪNG do hết gói — xem §7.3 legacy. Kiến trúc mới: SPA tĩnh trên **Vercel**, API Hono chạy Docker trên **Render free**, DB là **Turso** remote libSQL (ADR-041 `TURSO_URL`).

### 7.0 Kiến trúc & luồng request

```
Browser/PWA (https://tnttvn.vercel.app)
   └─ /api/* → vercel.json rewrite → https://tnttvn.onrender.com/api/*
                                     └─ Hono (Docker, render.yaml blueprint)
                                          └─ @libsql/client → Turso cloud DB (TURSO_URL)
```

- Repo có sẵn **`render.yaml`** blueprint: Render Dashboard → New → Blueprint → chọn repo → Render tự tạo service `tnttvn-api`, healthcheck `/health`.
- Render inject biến `PORT` (~10000) — server bind theo `SERVER_PORT || PORT || 3001` nên KHÔNG cần cấu hình port.
- DB mới TRỐNG: startup seed user admin qua `SEED_ADMIN_PASSWORD` (chỉ seed khi chưa có user nào — `seed-no-overwrite`).

### 7.1 Các bước thiết lập (một lần)

1. **Turso**: đăng ký platform.turso.io → tạo DB (vd `tnttvn`) → lấy `TURSO_URL` (`libsql://...`) + tạo token (`TURSO_AUTH_TOKEN`).
2. **Render**: New → Blueprint → connect repo → sau sync đầu, nhập tay các env đánh dấu `sync:false` trong render.yaml:
   - Bắt buộc: `TURSO_URL`, `TURSO_AUTH_TOKEN`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `PASSWORD_CIPHER_KEY` (64 hex), `REPORT_HMAC_SECRET` (SEC-HMAC-1 fail-closed), `SEED_ADMIN_PASSWORD` (8–128 ký tự, có hoa + số + đặc biệt).
   - Tuỳ chọn: `OPS_TOKEN`, `TELEGRAM_*`, `SENTRY_DSN`.
   - Sinh secret cục bộ (PowerShell): `-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 64 | % {[char]$_})`; với `PASSWORD_CIPHER_KEY` dùng 64 hex.
3. **Vercel**: `vercel.json` rewrite `/api/:path*` → `https://tnttvn.onrender.com/api/:path*` (đã cập nhật trong repo) — push là deploy lại.
4. **Mobile build**: `codemagic.yaml` + `.github/workflows/ios-ipa.yml` đã trỏ `VITE_API_BASE` sang Render domain.

### 7.2 Đặc tính gói Render free — cần biết

- **Cold start**: service spin-down sau ~15 phút không có request; request đầu mất ~30–60s. Client fetch timeout 30s → lần login đầu sau idle CÓ THỂ timeout, thử lại lần 2 sẽ vào được. Giải pháp: keep-alive ping `/health` mỗi 10 phút (cron-job.org miễn phí) hoặc nâng gói Starter ($7).
- **Disk ephemeral**: KHÔNG lưu gì lâu dài trên container — mọi dữ liệu phải nằm ở Turso; file backup local chỉ mang tính tạm. Nên cấu hình `AUTO_BACKUP_*` đẩy snapshot lên Cloudflare R2 (backupScheduler).
- **750 giờ/tháng**: đủ cho 1 service luôn bật.

### 7.3 Legacy — Railway (SUPERSEDED, không còn hoạt động)

- Domain cũ `tnttvn-production.up.railway.app` trả 404 nền tảng (`x-railway-fallback: true`, "Application not found") từ 2026-08-24 do hết hạn gói.
- Chẩn đoán chi tiết + dấu hiệu nhận biết: xem git history DEPLOYMENT_GUIDE trước 2026-08-25 và ADR/API-DIAG trong AI_CONTEXT_MAP.
- Nếu quay lại Railway: resume service + giữ nguyên kiến trúc SQLite volume, hoàn tác rewrite vercel.json về domain Railway.

## 7-BIS. [DEPRECATED] RAILWAY DEPLOYMENT NOTES (2026-08-15 → 2026-08-24)

> Toàn bộ mục này chỉ giữ lại để tham khảo khi quay về Railway. Cấu hình hiện hành là §7 (Render + Turso).

- `railway.json` dùng `"builder": "DOCKERFILE"` (**không phải Nixpacks**) → Railway chạy **cùng Dockerfile** nhưng **không có Nginx** đứng trước.
- Hệ quả bảo mật (A15): nếu publish thẳng cổng Node **KHÔNG được set `TRUST_PROXY`** — `getClientIp` fallback về socket IP thật (chống spoof header bypass rate limit).
- Muốn tin proxy header khi chạy Railway: đặt Cloudflare (hoặc proxy khác có kiểm soát) phía trước, rồi mới bật `TRUST_PROXY` khi chắc chắn proxy luôn ghi đè `X-Real-IP`.
- Frontend `vercel.json` định tuyến proxy `/api/:path*` $\rightarrow$ `https://tnttvn-production.up.railway.app/api/:path*` để chuyển tiếp an toàn mọi REST API methods (POST/GET/PUT/DELETE) về backend Railway, tránh lỗi 405 Method Not Allowed do static SPA fallback.
- **PWA freshness (FE-07, 2026-08-16)**: `vercel.json` ép `Cache-Control: no-store` cho `/sw.js` và `no-cache, no-store` cho `/index.html`; `pushManager` đăng ký SW với `updateViaCache: 'none'`; SW có `skipWaiting()` + `clientsClaim()` và **tự động reload mọi tab đang mở** khi có build mới activate (trừ `/login`). Hệ quả: sau mỗi deploy, mọi tab cũ nhảy lên build mới ngay — không còn hiện tượng tab mở nhiều ngày chạy JS cũ ("0 thiếu nhi" ảo, sync queue kẹt). Người dùng không cần thao tác gì; nếu tab treo quá lâu vẫn chưa reload, hard refresh 1 lần (`Ctrl+Shift+R` / Clear site data).

### 7-BIS.1 Troubleshooting — API trả 404 "Application not found" (backend offline)

**Triệu chứng**: Vercel load SPA bình thường nhưng mọi call `/api/*` (vd `/api/auth/login`) → **404**, console hiển thị body `{"status":"error","code":404,"message":"Application not found","request_id":...}`. Client (từ API-DIAG 2026-08-25) hiện thông điệp *"Máy chủ API hiện không khả dụng (backend chưa chạy hoặc đã dừng)..."*.

**Chẩn đoán (evidence chain)**:
1. Response mang header **`x-railway-fallback: true`** + `Server: railway-hikari` → đây là 404 của **nền tảng Railway**, KHÔNG phải của app Hono (app Hono trả JSON `{ success:false, error:{...} }` không có header này).
2. Ý nghĩa: domain `tnttvn-production.up.railway.app` còn tồn tại nhưng **không có deployment nào đang chạy** — service bị pause/xóa/rename, hoặc deploy fail hoàn toàn (không còn bản active).
3. Rewrite của Vercel hoạt động đúng (proxy chain thấy `X-Railway-Edge` trong response) → KHÔNG sửa `vercel.json`.

**Xử lý trên Railway dashboard**:
1. Kiểm tra service backend còn tồn tại/không bị pause; nếu project hết hạn gói free/hobby → service bị dừng, cần resume/nâng cấp billing.
2. Nếu service còn: xem tab **Deployments** — deploy mới có fail không? Deploy fail phổ biến: thiếu env bắt buộc (đặc biệt `REPORT_HMAC_SECRET` — SEC-HMAC-1 fail-closed lúc startup ở production), healthcheck `/health` không PASS trong 30s.
3. Đảm bảo domain `tnttvn-production.up.railway.app` vẫn được attach vào service (Settings → Networking → Domains).
4. Sau khi backend chạy lại, verify: `curl -i https://tnttvn-production.up.railway.app/api/health` phải trả 200 JSON của app (KHÔNG chứa `x-railway-fallback`).

---

## 8. WEB PUSH (VAPID) SETUP

Web push (thông báo trình duyệt) chỉ hoạt động khi server có cặp VAPID keys. **Thiếu keys → `GET /api/notifications/vapid-public-key` trả 501 `VAPID_NOT_CONFIGURED`** và client bỏ qua đăng ký push (log `[pushManager] push subscription failed (skipping)` — fail-closed đúng thiết kế, không crash app).

### 8.1 Tạo cặp VAPID keys

```bash
cd server
npm run vapid:generate   # web-push generate-vapid-keys --json
```

Output có dạng:

```json
{
  "publicKey": "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkMcZhXJ4sW-f5KLbJhX3PTaBbBhoVvNLXfW1vPrM",
  "privateKey": "j3jK... (hex)"
}
```

### 8.2 Cấu hình production (Railway / Docker)

1. Set 3 biến môi trường: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (lấy từ output trên), `VAPID_SUBJECT` (khuyến nghị `mailto:<email quản trị thật>`).
2. **Restart/redeploy** service (keys được đọc khi server khởi động — `webPushService.ts` đọc `process.env` mỗi lần gọi, nhưng cần khởi động lại để pick env mới trên Railway).
3. Verify: `curl https://<api-host>/api/notifications/vapid-public-key` với Bearer token → 200 `{ data: { publicKey } }` (trước đó: 501).
4. Client (đã login) sẽ tự đăng ký push ở lần reload/login kế tiếp — không cần thay đổi code.

> Lưu ý bảo mật: `VAPID_PRIVATE_KEY` là bí mật — không commit vào repo, không ghi vào log. Vòng đời key rò rỉ → generate lại cặp mới + set lại env: subscription cũ bị push service từ chối (signature không khớp `applicationServerKey` lúc subscribe) → `sendWebPushToParish` nhận lỗi và dọn subscription chết, client re-subscribe ở lần login/reload kế tiếp.

---


## 9. AUTOMATED & SNAPSHOT-SAFE DATABASE BACKUP (INF-01, INF-02, INF-03)

### 9.1 Cơ Chế Sao Lưu Nhất Quán (Snapshot-Consistent)
Hệ thống sử dụng cơ chế sao lưu 2 lớp đảm bảo an toàn cho SQLite ở chế độ WAL (`PRAGMA journal_mode=WAL`):
1. **Lớp 1 (VACUUM INTO)**: Sử dụng lệnh chuẩn SQLite `VACUUM INTO '<destination_file>'` sau khi đã `PRAGMA wal_checkpoint(TRUNCATE)`, tạo bản sao lưu nguyên tử, nén và nhất quán 100% ngay cả khi đang có truy vấn ghi đồng thời.
2. **Lớp 2 (Fallback Copy)**: Nếu VACUUM INTO không khả dụng, thực hiện checkpoint WAL trước khi sao lưu file nhị phân.
3. **Chính Sách Lưu Trữ (Retention)**: Tự động giữ lại 5 bản sao lưu gần nhất (có thể cấu hình qua biến `BACKUP_RETENTION_COUNT`).

### 9.2 Các Phương Thức Kích Hoạt
1. **Tự Động Nội Bộ (In-Process Scheduler - INF-02)**: Khởi động tự động cùng server Node.js (`backupScheduler.ts`), mặc định thực hiện sao lưu vào 02:00 AM hàng ngày và đánh dấu marker `auto_backup_last_date` trong `system_settings`. Tắt bằng `AUTO_BACKUP_ENABLED=false`.
2. **Thủ Công / CLI (INF-01)**:
   ```bash
   npm run db:backup # Chạy node scripts/backup-db.mjs
   ```
3. **Container / Cron Ngoại Vi**:
   File script được copy vào `/usr/local/bin/backup-db.mjs` trong Docker container để các trình lập lịch bên ngoài (nếu có) có thể gọi trực tiếp:
   ```bash
   node /usr/local/bin/backup-db.mjs
   ```