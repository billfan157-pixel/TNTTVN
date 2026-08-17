# DEPLOYMENT & INFRASTRUCTURE OPERATIONS GUIDE - PARISH LMS v2.0

Document Status: **APPROVED**  
Architecture Lead: Chief Architect & AI Pair Programming Agent  
Last Updated: 2026-08-16 (FE-07: PWA freshness — no-store sw.js/index.html, updateViaCache none, reload-on-activate); 2026-08-12 (Web Push §8 VAPID setup — fix production 501 `VAPID_NOT_CONFIGURED`; env table VAPID ⚠️ conditional); 2026-08-10 (A-NEW-12: CORS split dev/prod — production default CHỈ tnttvn.vercel.app; A-NEW-08: xlsx 0.20.3; A-NEW-04/01/02: refresh cookie SameSite=None;Secure ở production cho Vercel→Railway cross-site)  

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
| `ALLOW_SEED_ADMIN_RESET` | ❌ No (deprecated) | — | **A-NEW-38 (2026-08-11): biến này KHÔNG còn được đọc** — block reset admin khi startup đã bị xóa. Xóa khỏi env để tránh nhầm lẫn |
| `HOST` | ❌ No | `0.0.0.0` | Server host binding IP |
| `PORT` | ❌ No | `3001` | Server HTTP port |
| `CLIENT_ORIGIN` | ❌ No | `https://tnttvn.vercel.app` — **A-NEW-12 (2026-08-10): production default KHÔNG còn localhost** | CORS allowed origin (comma-separated, tự động trim khoảng trắng thừa). **A13 + A-NEW-12**: allowlist CỨNG trong `server/src/utils/originPolicy.ts` — `resolveAllowedOrigins()` split theo môi trường: `NODE_ENV=production` → default CHỈ `https://tnttvn.vercel.app` (localhost bị loại); dev → `http://localhost:5173, http://localhost:5174, http://localhost:4173` + `https://tnttvn.vercel.app`. Env này ghi đè hoàn toàn default (thêm origin production có chủ đích, ví dụ domain tĩnh riêng). Bất kỳ origin nào ngoài allowlist → phản hồi KHÔNG có `Access-Control-Allow-Origin` (từ chối). `<origin>`/`http://localhost:*` phải khớp đúng scheme+host+port (A14) — nếu dev cần origin khác, set env `CLIENT_ORIGIN` tạm |
| `DB_PATH` | ❌ No | `./data/parish.db` (relative to `server/`) | SQLite database file path (WAL mode) |
| `BACKUP_DIR` | ❌ No | `./backups` | Target directory for automated database backups |
| `TRUST_PROXY` | ⚠️ Có điều kiện | `false` | **A15 (2026-08-10)**: `getClientIp` chỉ tin `x-real-ip` / `x-forwarded-for` (giá trị cuối) khi `TRUST_PROXY=true` — **BẮT BUỘC bật khi chạy sau Nginx** (docker-compose đã set sẵn). Deploy thẳng không proxy (Railway DOCKERFILE) **KHÔNG bật** — server lấy socket IP thật, chống spoof header bypass rate limit |
| `OPS_TOKEN` | ⚠️ Có điều kiện | Empty → **fail-closed 403** | **A-NEW-28 (2026-08-11)**: token (Bearer) gate `/ready` + `/metrics` — **thiếu token → 403 (fail-closed, KHÔNG public)**; đúng token → 200. `/health` giữ public (probe dùng endpoint này). **Set trên Railway + docker-compose để mở monitoring** — nếu chưa set, chỉ mất /metrics + /ready (không ảnh hưởng healthcheck) |
| `SAFETY_BACKUP_DIR` | ❌ No | `{DB_PATH dir}/backups/safety` | Safety snapshot directory for destructive ops (purge) |
| `SEED_ADMIN_PASSWORD` | ❌ No | Auto-generated | **A-NEW-38 (2026-08-11):** Chỉ dùng để **tạo admin lần đầu khi DB trống** (`seedIfEmpty`/`npm run db:seed`) — **KHÔNG reset mật khẩu khi server khởi động** nữa (block startup đã xóa; chạy lại seed = `onConflictDoNothing`, không ghi đè `passwordHash`). Reset mật khẩu admin production qua admin flow / `admin-change-password` |
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

## 7. ALTERNATIVE DEPLOYMENT (RAILWAY) — KHÔNG CÓ NGINX

- `railway.json` dùng `"builder": "DOCKERFILE"` (**không phải Nixpacks**) → Railway chạy **cùng Dockerfile** nhưng **không có Nginx** đứng trước.
- Hệ quả bảo mật (A15): nếu publish thẳng cổng Node **KHÔNG được set `TRUST_PROXY`** — `getClientIp` fallback về socket IP thật (chống spoof header).
- Muốn tin proxy header khi chạy Railway: đặt Cloudflare (hoặc proxy khác có kiểm soát) phía trước, rồi mới bật `TRUST_PROXY` khi chắc chắn proxy luôn ghi đè `X-Real-IP`.
- Frontend `vercel.json` định tuyến proxy `/api/:path*` $\rightarrow$ `https://tnttvn-production.up.railway.app/api/:path*` để chuyển tiếp an toàn mọi REST API methods (POST/GET/PUT/DELETE) về backend Railway, tránh lỗi 405 Method Not Allowed do static SPA fallback.
- **PWA freshness (FE-07, 2026-08-16)**: `vercel.json` ép `Cache-Control: no-store` cho `/sw.js` và `no-cache, no-store` cho `/index.html`; `pushManager` đăng ký SW với `updateViaCache: 'none'`; SW có `skipWaiting()` + `clientsClaim()` và **tự động reload mọi tab đang mở** khi có build mới activate (trừ `/login`). Hệ quả: sau mỗi deploy, mọi tab cũ nhảy lên build mới ngay — không còn hiện tượng tab mở nhiều ngày chạy JS cũ ("0 thiếu nhi" ảo, sync queue kẹt). Người dùng không cần thao tác gì; nếu tab treo quá lâu vẫn chưa reload, hard refresh 1 lần (`Ctrl+Shift+R` / Clear site data).

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
