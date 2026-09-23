# DEPLOYMENT & INFRASTRUCTURE OPERATIONS GUIDE - PARISH LMS v2.0

> **Policy supersession — 2026-09-10, được chủ sản phẩm phê duyệt:** Admin có
> quyền quản trị toàn giáo xứ trong mọi môi trường, kể cả production; được tạo/sửa
> nhiệm kỳ cho chính mình. Các mô tả admin production read-only, cấm self-grant
> hoặc override chỉ dev/test bên dưới đã bị thay thế. Biến legacy
> `OPERATIONS_ADMIN_MUTATION_OVERRIDE` không còn giới hạn quyền. Vẫn bắt buộc
> reauth + lý do + audit cho nhiệm kỳ; không bỏ tenant isolation, OCC, idempotency,
> kiểm tra phạm vi dữ liệu, trạng thái đóng việc hoặc separation of duty.

Document Status: **APPROVED**  
Architecture Lead: Chief Architect & AI Pair Programming Agent  
Last Updated: 2026-09-23 (CSP-TOOLBAR-1: gỡ allowance Vercel Toolbar `vercel.live` khỏi CSP production — Toolbar phải Off cho Production); 2026-09-09 (ADR-110: server-authoritative parish civil date for Operations service terms); 2026-09-06 (ADR-108: read-only roster integrity inventory); 2026-09-05 (ADR-106: single-parish production deployment, fail-closed persisted-scope preflight); 2026-09-04 (ADR-105: restore target preparation/fingerprint, verified manifest phase timings và read-only promotion/Sunday readiness preflight); 2026-09-03 (ADR-100: khóa Vercel Git auto-deploy, exact frontend/backend release provenance và post-deploy auth/header smoke); 2026-09-01 (ADR-092: Vercel HTML security headers, `/health` rewrite, 65s bounded refresh cold-start; Android backup/camera privacy)

---

## 1. ARCHITECTURAL CLASSIFICATION
### Auth remediation rollout (2026-09-05)

- Đặt `DEPLOYMENT_PARISH_ID=gia-ton` cho deployment hiện tại (hoặc exact parish slug đã inventory). Production thiếu biến này sẽ không khởi động. Nếu còn `PARISH_ID`/`SUPER_ADMIN_PARISH_ID`, chúng phải khớp tuyệt đối; không dùng biến cũ để chọn tenant khác.
- Đặt `SUPER_ADMIN_ID` đúng tài khoản quản trị cần bảo vệ trong giáo xứ deployment. Account còn phải có `role=admin`; `DEPLOYMENT_PARISH_ID` là nửa parish của composite protected principal. Không đổi secrets chỉ để áp bản sửa này.
- Trước rollout, inventory read-only mọi bảng có `parish_id`. Nếu startup báo table mixed/null scope, dừng rollout và điều tra/migrate trên bản sao; không sửa trực tiếp, purge hoặc đổi `DEPLOYMENT_PARISH_ID` chỉ để vượt gate. Startup tự kiểm trước HTTP/workers và không log row/PII.
- Chạy `npm run audit:deployment-parish` với `DEPLOYMENT_PARISH_ID` và read-only `AUDIT_DATABASE_URL`/`AUDIT_DATABASE_AUTH_TOKEN` trước deploy. Output mặc định hash database/parish reference; chỉ set `DEPLOYMENT_INVENTORY_INCLUDE_PARISH_ID=true` khi operator chủ động cần plain parish ID. Exit code khác 0 là rollout blocker.
- Phát hành backend và frontend cùng contract: tạo admin yêu cầu `adminPassword`; parent không được gọi raw grades/attendance; QR public chỉ xác nhận `signed_identifiers`, không attestation bản in.
- Client mới migrate cache grades/attendance version 0 về rỗng và dùng `sync_cursor_v2` để full-pull lại; durable `syncQueue` không bị xóa. Cần reload/update ứng dụng. Không thể thu hồi dữ liệu đã tải xuống thiết bị chưa chạy bản mới, file export hay ảnh chụp; operator phải đánh giá exposure riêng nếu cần. Không wipe pending offline mutations như một biện pháp dọn read cache.
- Local regression không thay smoke production: kiểm parent read 403, staff đúng lớp, admin step-up, cookie refresh và QR trên exact release đã triển khai. Chưa có xác nhận production trong remediation này.

### Cross-domain evidence preflight (2026-09-07)

- Sau khi migrations `20260907-177..181` đã có trên target, chạy `npm run audit:promotion-reconciliation`, `npm run audit:roster-integrity` và `npm run audit:cross-domain-reconciliation` bằng read-only `AUDIT_DATABASE_URL`/`AUDIT_DATABASE_AUTH_TOKEN`.
- Cross-domain inventory chỉ phát hiện: năm protected thiếu policy/snapshot/cohort evidence và Grade daily-derived lệch/mất ledger; active manual override được loại trừ. Output mặc định băm parish/aggregate reference và không in tên, số điện thoại hay điểm số.
- Finding là gate để operator review trên bản sao. Không chạy backfill, đổi Grade, mở khóa năm hay suy lịch sử từ current settings/class pointer. Script fail trước query inventory nếu target chưa có schema evidence hiện hành.

This document is the **Canonical Single Source of Truth (SSOT)** for Docker packaging, Nginx reverse proxy configuration, automated SQLite backups, environment variables, and production operational procedures.

---

## 2. CONTAINERIZED SYSTEM ARCHITECTURE (`docker-compose.yml`)

The repository's self-hosted topology consists of two services orchestrated via Docker Compose. The current hosted deployment uses Render/Turso/Vercel (§7); do not assume Compose describes that runtime.

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
       └── In-process backup scheduler (server/src/services/backupScheduler.ts)
```

---

## 3. ENVIRONMENT VARIABLES SPECIFICATION

| Variable | Required | Default / Format | Description |
| :--- | :---: | :--- | :--- |
| `DEPLOYMENT_PARISH_ID` | ✅ Yes (production) | Parish slug 1–64 ký tự, ví dụ `gia-ton` | Identity bất biến của installation. Login/recovery/token/seed/backup/workers bị khóa vào scope này. Startup fail nếu thiếu/sai format, legacy parish env mâu thuẫn, hoặc DB có bất kỳ `parish_id` null/khác giá trị này. Dev/test không set vẫn giữ multi-parish fixtures. |
| `PARISH_TIME_ZONE` | ❌ No | `Asia/Ho_Chi_Minh`; IANA timezone | Múi giờ dân sự do server dùng cho quy tắc chỉ có ngày, hiện gồm ngày hiệu lực `parish_service_terms` trong Operations. Không lấy timezone trình duyệt và không dùng UTC để quyết định ngày bắt đầu/kết thúc quyền. Giá trị cấu hình không hợp lệ làm startup fail trước HTTP/workers. Một deployment hiện chỉ phục vụ một giáo xứ nên đây là cấu hình deployment, không phải preference người dùng. |
| `JWT_SECRET` | ✅ Yes | String (min 32 chars) | Secret key for JWT access token signing. **BẮT BUỘC** set trong `.env` (root) — docker-compose dùng `${JWT_SECRET:?}` fail-fast nếu thiếu |
| `JWT_REFRESH_SECRET` | ✅ Yes (production) | String (min 32 chars), **không** fallback về `JWT_SECRET` | Secret key for refresh token signing. Production startup sẽ throw nếu thiếu |
| `REPORT_HMAC_SECRET` | ✅ Yes (production) — **SEC-HMAC-1 (2026-08-24)** | String (min 32 chars, random riêng, KHÔNG tái dùng JWT_SECRET) | Secret key ký HMAC-SHA256 cho QR phiếu điểm/chứng nhận (`/api/verification/sign`). Production **fail-closed lúc startup** nếu thiếu (`hmacSigner.ts`). Verify giữ chuỗi fallback legacy (JWT_SECRET-derived) nên QR đã phát hành cũ vẫn xác thực được sau khi set secret mới. QR phát hành trước 2026-08-24 trên prod thiếu biến này đã bị ký bằng key suy dẫn từ JWT_SECRET/literal public → **bắt buộc rotate: set REPORT_HMAC_SECRET ngay khi nâng cấp**; QR cũ ký bằng literal public sẽ trở thành KHÔNG hợp lệ (đúng ý — chúng vốn có thể giả mạo bởi bất kỳ ai đọc repo) |
| `ALLOW_SEED_ADMIN_RESET` | ❌ No (deprecated) | — | **A-NEW-38 (2026-08-11): biến này KHÔNG còn được đọc** — block reset admin khi startup đã bị xóa. Xóa khỏi env để tránh nhầm lẫn |
| `HOST` | ❌ No | `0.0.0.0` | Server host binding IP |
| `PORT` | ⚠️ Railway: ⚠️ nên đọc | `3001` (fallback) | Server HTTP port — priority: `SERVER_PORT` → `PORT` → `3001` (`server/src/index.ts`). **A-NEW-49 (2026-08-17): Railway INJECT `PORT` lúc runtime (mặc định 8080) và DÙNG CHÍNH giá trị này cho healthcheck + public routing** — code phải đọc `PORT` để bind đúng cổng probe; deploy FAILED 3f6bc7e1 vì bản rewrite chỉ đọc `SERVER_PORT` → bind 3001 trong khi Railway probe 8080 → `service unavailable`. docker-compose set `PORT=3000` theo `.env.example` |
| `CLIENT_ORIGIN` | ❌ No | `https://tnttvn.vercel.app,capacitor://localhost,https://localhost` — **A-NEW-58 (2026-08-19/2026-08-31): production default thêm origin native shell Capacitor** (iOS `capacitor://localhost`, Android `https://localhost`); **SEC-CORS-1 (2026-09-09): production loại `http://localhost` port 80 cùng các localhost dev ports** | CORS allowed origin (comma-separated, tự động trim khoảng trắng thừa). **A13 + A-NEW-12 + A-NEW-58 + SEC-CORS-1**: allowlist CỨNG trong `server/src/utils/originPolicy.ts` — `resolveAllowedOrigins()` split theo môi trường: `NODE_ENV=production` → default `https://tnttvn.vercel.app` + 2 origin native; dev → `http://localhost:3000, http://localhost:5173, http://localhost:5174, http://localhost:4173` + `https://tnttvn.vercel.app` + 2 origin native. Khi set `CLIENT_ORIGIN` tùy biến (ví dụ domain riêng), server tự động merge thêm các origin native (`capacitor://localhost`, `https://localhost`) để không làm hỏng app di động. `http://localhost` port 80 không phải origin của native shell thật và không được cấu hình cho production. Bất kỳ origin web nào ngoài allowlist → phản hồi KHÔNG có `Access-Control-Allow-Origin` (từ chối). |
| `DB_PATH` | ❌ No | `./data/parish.db` (relative to `server/`) | SQLite database file path (WAL mode) |
| `BACKUP_DIR` | ❌ No | `./backups` | Target directory for automated database backups |
| `OPERATIONS_RECEIPT_RESPONSE_RETENTION_DAYS` | ❌ No; policy-gated | Empty = disabled; integer `1..3650` days | Compacts only the stored response body of old Operations idempotency receipts. The immutable `(parish, actor, key)`, command and request hash remain as a tombstone, so late retries return `IDEMPOTENCY_REPLAY_EXPIRED` and never execute again. Set only after the applicable data-retention owner approves a duration; an invalid configured value fails startup. |
| `TRUST_PROXY` | ⚠️ Có điều kiện | `false` | **A15 (2026-08-10)**: `getClientIp` chỉ tin `x-real-ip` / `x-forwarded-for` (giá trị cuối) khi `TRUST_PROXY=true` — **BẮT BUỘC bật khi chạy sau Nginx** (docker-compose đã set sẵn). Deploy thẳng không proxy (Railway DOCKERFILE) **KHÔNG bật** — server lấy socket IP thật, chống spoof header bypass rate limit |
| `OPS_TOKEN` | ⚠️ Có điều kiện | Empty → **fail-closed 403** | **A-NEW-28 (2026-08-11)**: token (Bearer) gate `/ready` + `/metrics` — **thiếu token → 403 (fail-closed, KHÔNG public)**; đúng token → 200. `/health` giữ public (probe dùng endpoint này). **Set trên Railway + docker-compose để mở monitoring** — nếu chưa set, chỉ mất /metrics + /ready (không ảnh hưởng healthcheck) |
| `SENTRY_DSN` | ❌ No (opt-in — OBS-2/ADR-111) | Empty → disabled | Sentry node error aggregation phía server (`utils/observability.ts`). Thiếu DSN → Sentry vô hiệu; structured console log vẫn hoạt động. Set DSN → capture unhandled error/onError với context kỹ thuật (requestId/path — không PII, `sendDefaultPii: false`). Khuyến nghị set cùng project với client `VITE_SENTRY_DSN` để gom nhóm chéo FE/BE |
| `SENTRY_TRACES_SAMPLE_RATE` | ❌ No | `0` | Performance tracing sample rate cho Sentry node — mặc định tắt (server xử lý PII trẻ em/phụ huynh; tracing không phải mục tiêu OBS-2) |
| `SAFETY_BACKUP_DIR` | ❌ No | `{DB_PATH dir}/backups/safety` | Safety snapshot directory for destructive ops (purge) |
| `SEED_ADMIN_PASSWORD` | ⚠️ Required khi DB trống | **Không có default**; 8–128 ký tự, ≥1 chữ hoa, ≥1 chữ số, ≥1 ký tự đặc biệt | **ADR-051 (2026-08-21):** chỉ được đọc khi chạy seed ban đầu (`seedIfEmpty` trên DB chưa có user hoặc `npm run db:seed`). Fresh startup **fail-closed** nếu thiếu/yếu; tuyệt đối không fallback về credential biết trước. Khi DB đã có user, startup không dùng biến này để reset mật khẩu; seed rerun vẫn `onConflictDoNothing` cho admin. Docker Compose truyền biến từ `.env`; Railway phải set trong dashboard trước lần init DB đầu tiên. |
| `SUPER_ADMIN_ID` | ✅ Yes (production protected admin) | Exact user ID | Nửa user của protected principal; chỉ được bảo vệ khi row/token đồng thời thuộc `DEPLOYMENT_PARISH_ID` và có `role=admin`. Không phải global role bypass. |
| `SUPER_ADMIN_PARISH_ID` | ❌ Compatibility only | — | Dev/test legacy scope. Khi set cùng `DEPLOYMENT_PARISH_ID` phải khớp; production authority luôn là deployment parish. |
| `VAPID_PUBLIC_KEY` | ⚠️ Có điều kiện | Empty | Web Push VAPID public key — client subscribe cần (trả qua `GET /api/notifications/vapid-public-key`); thiếu → **mới 2026-08-28**: `GET /vapid-public-key` trả 200 `{ publicKey: null, configured:false }` (không còn 501 spam, client skip debug), `/send` vẫn 501 và queue đánh `failed` (không `sent` giả) — **fail-closed đúng thiết kế** (xem §8 Web Push Setup) |
| `VAPID_PRIVATE_KEY` | ⚠️ Có điều kiện | Empty | Web Push VAPID private key — **điều kiện**: BẮT BUỘC set cùng `VAPID_PUBLIC_KEY` nếu muốn tính năng thông báo web push hoạt động (thiếu → GET 200 configured:false, client skip graceful; POST /send 501) |
| `VAPID_SUBJECT` | ❌ No | `mailto:admin@giaoly.com` | VAPID contact subject (khuyến nghị đổi thành email quản trị thật của giáo xứ) |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | ⚠️ Required cho Android native push | Empty | Service account JSON cho FCM HTTP v1 (`project_id`, `client_email`, `private_key`). Thiếu cấu hình: Android token được đếm `skipped`, không giả là sent |
| `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY`, `APNS_BUNDLE_ID`, `APNS_ENVIRONMENT` | ⚠️ Required cho iOS native push | bundle `com.tnttvn.app`, env `production` | APNs HTTP/2 token auth. `.p8` giữ trong secret manager; private key có thể dùng newline thật hoặc `\\n`. `development` chỉ dùng sandbox/dev provisioning |
| `BACKUP_ENCRYPTION_KEY` | ⚠️ Required với Turso backup | 32 byte (64 hex hoặc base64), tách khỏi JWT/R2 keys | AES-256-GCM cho logical backup Turso trước khi upload R2 (ADR-059). Mất key = không giải mã được backup; lộ key + R2 artifact = mất tính bí mật |
| `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | ⚠️ Required với Turso backup | Cloudflare R2 S3-compatible | Kho backup độc lập với Turso. Remote DB không fallback xuống disk Render ephemeral |
| `ALLOW_BACKUP_RESTORE` | ⚠️ Restore drill only | `false`; phải set chính xác `true` | Explicit write gate cho cả prepare và restore. Không set biến này trên production service thường trực |
| `RESTORE_DATABASE_URL`, `RESTORE_DATABASE_AUTH_TOKEN` | ⚠️ Restore drill only | Disposable Turso/libSQL target | Target cô lập để prepare/restore; URL trùng `TURSO_URL` bị từ chối |
| `RESTORE_TARGET_FINGERPRINT` | ⚠️ Restore drill only | SHA-256 lowercase của normalized target URL | Xác nhận target lần hai; phải khớp chính xác trước mọi prepare/restore write |
| `AUDIT_DATABASE_URL`, `AUDIT_DATABASE_AUTH_TOKEN` | ❌ No | Cả URL trống → dùng `TURSO_URL`/`TURSO_AUTH_TOKEN` hoặc local `DB_PATH` | Optional target cho các command inventory read-only. Khi set URL riêng, script chỉ dùng token audit riêng, không fallback chéo sang `TURSO_AUTH_TOKEN`; local file có thể không cần token |
| `DEPLOYMENT_INVENTORY_INCLUDE_PARISH_ID` | ❌ No | `false` | Chỉ ảnh hưởng output `audit:deployment-parish`: mặc định parish reference bị hash; `true` in plain configured ID theo opt-in của operator. Không thay scope/gate. |
| `ROSTER_INVENTORY_INCLUDE_PARISH_ID` | ❌ No | `false` | Chỉ ảnh hưởng output `audit:roster-integrity`: mặc định parish, student, class, user, assignment và batch references bị hash; biến này chỉ cho phép plain parish ID, không bao giờ in PII/raw object IDs. |
| `CROSS_DOMAIN_INVENTORY_INCLUDE_PARISH_ID` | ❌ No | `false` | Chỉ ảnh hưởng output `audit:cross-domain-reconciliation`: mặc định parish và aggregate references bị hash; `true` chỉ cho phép plain parish ID, không in raw student/Grade ID hay điểm số. |
| `VITE_SENTRY_DSN` | ❌ No | URL | Frontend Sentry project DSN |

---

## 4. DOCKER MULTI-STAGE BUILD SPECIFICATION

### 4.1 Server (`Dockerfile`)
- **Base Image**: `node:22-alpine`
- **Build Stage**: Installs dependencies, compiles TypeScript (`npm run build:server`), sets `outDir: dist`.
- **Production Stage**: `scripts/entrypoint.sh` repairs `/app/data` ownership and executes `su-exec appuser:appgroup node server/dist/index.js`. It does not run cron or a startup backup. The Node composition root registers the in-process backup scheduler after startup readiness.
- **ADR-051/106 startup contract**: DB migrations and executable-schema readiness must pass; then a read-only dynamic scan rejects every table containing null/foreign `parish_id`. Initial seed (only when DB is empty) uses `DEPLOYMENT_PARISH_ID`, commits atomically and is followed by the same scope check. All gates complete before HTTP/background workers; no automatic data rewrite or purge occurs.

### 4.2 Web Frontend (`Dockerfile.web`)
- **Base Image**: `node:22-alpine` $\rightarrow$ `nginx:1.27-alpine`
- **Build Stage**: Runs `vite build` outputting static assets to `/app/dist`.
- **Runtime Stage**: Copies static assets to Nginx html root (`/usr/share/nginx/html`) and applies `nginx.conf`.

---

## 5. AUTOMATED SQLITE BACKUP & GRACEFUL SHUTDOWN

### 5.1 Scheduler and standalone SQLite backup
- `server/src/services/backupScheduler.ts` checks every minute while the process is running. The target is host-local hour `AUTO_BACKUP_HOUR` (0–23, default 2); a check after the missed window catches up when today's successful marker is absent. Failed runs leave the marker unchanged and retry on a later tick. `AUTO_BACKUP_ENABLED=false` disables scheduling.
- Local SQLite uses `VACUUM INTO` → unique partial file → atomic rename, never raw file copy. Local blob publication also uses a temporary file + rename; incomplete `.partial-*`/`.tmp-*` objects are excluded from listing/retention. A failed post-publish storage operation does not truncate the published SQLite artifact. This is not a power-loss/fsync durability guarantee.
- The standalone `scripts/backup-db.mjs` is an explicit manual SQLite command, not an installed cron job. DB source defaults to `server/data/parish.db` (`DB_PATH` override); destination defaults to `./backups` (`BACKUP_DIR` override). Turso uses encrypted logical backup to R2, not this SQLite command (§9).
- Retention keeps the configured number of complete artifacts (default 5). Protected `/ready` includes `backup.enabled/lastAutoBackupDate/isCurrent/overdue`; protected `/metrics` includes `catevia_backup_overdue`. Both require `OPS_TOKEN`. Before the target hour, yesterday's success is current. The marker signals scheduled-run freshness, not proof the stored object remains usable; it does not change public liveness or force restart loops.

### 5.2 Graceful Shutdown Handler (`server/src/index.ts`)
- Listens for `SIGTERM` and `SIGINT` signals from Docker / Railway.
- Composition root is the only signal owner. It stops import/backup/Sunday/Operations producers and HTTP intake, awaits active scheduler ticks, drains active Web/Native notification delivery, closes Puppeteer, then checkpoints and closes the database before exit (ADR-104/111).
- A 10-second deadline force-exits with failure if an external resource hangs. Durable notification rows and leases remain the restart recovery boundary; graceful shutdown does not claim exactly-once provider delivery.

---

## 6. COMMAND QUICK REFERENCE

```bash
# Build and launch production containers
docker-compose up -d --build

# View container logs
docker-compose logs -f app

# Trigger immediate manual database backup
docker-compose exec app node /usr/local/bin/backup-db.mjs
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
- `vercel.json` đặt rewrite `/health` → Render trước `/api` và SPA fallback; System Diagnostics vì vậy nhận JSON DB-aware thay vì `index.html`. Cùng file áp CSP/frame/nosniff/referrer/Permissions-Policy cho static HTML; `camera=(self)` phải được giữ cho OMR và microphone bị tắt.
- **CSP ↔ Vercel Toolbar (CSP-TOOLBAR-1, 2026-09-23):** Vercel project **phải để Vercel Toolbar = `Off` cho Production** (Project Settings → General → Vercel Toolbar; kiểm tra cả team-level, vì team-level `On` có thể ghi đè project khi cho phép override). Toolbar (`feedback.js` từ `vercel.live` do Vercel edge inject cho viewer đã đăng nhập Vercel) dựng UI bằng `<style>` element → luôn bị `style-src 'self'` (A-NEW-23) chặn và sinh lỗi console *"Applying inline style violates … style-src …"* mỗi lần tải; Vercel xác nhận toolbar **không hỗ trợ strict CSP** (muốn chạy phải có `style-src 'unsafe-inline'` — không được phép ở đây). Vì vậy CSP trong `vercel.json` **không** allow-list `vercel.live`/`assets.vercel.com`; thêm lại sẽ fail `deploymentSecurityContract.test.ts` và post-deploy smoke của `deploy-production.yml`. Vi phạm cũng được browser gửi tới `report-uri /api/csp-report` nên bỏ toolbar giữ log WARN sạch cho phát hiện XSS (OBS-1). Automation/Playwright chạy trên preview deployment dùng header `x-vercel-skip-toolbar: 1`.

### 7.1 Các bước thiết lập (một lần)

1. **Turso**: đăng ký platform.turso.io → tạo DB (vd `tnttvn`) → lấy `TURSO_URL` (`libsql://...`) + tạo token (`TURSO_AUTH_TOKEN`).
2. **Render**: New → Blueprint → connect repo → sau sync đầu, nhập tay các env đánh dấu `sync:false` trong render.yaml:
   - Bắt buộc: `DEPLOYMENT_PARISH_ID=gia-ton` (hoặc exact inventory scope), `TURSO_URL`, `TURSO_AUTH_TOKEN`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `REPORT_HMAC_SECRET` (SEC-HMAC-1 fail-closed), `SEED_ADMIN_PASSWORD` (8–128 ký tự, có hoa + số + đặc biệt), `BACKUP_ENCRYPTION_KEY` (64 hex/base64 32 byte) và đủ 4 biến `R2_*`. Blueprint đặt `PARISH_TIME_ZONE=Asia/Ho_Chi_Minh`; phải kiểm tra lại giá trị này khi giáo xứ không ở múi giờ đó.
   - Tuỳ chọn: `OPS_TOKEN`, `SENTRY_DSN`.
   - Sinh secret cục bộ (PowerShell): `-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 64 | % {[char]$_})`; với `BACKUP_ENCRYPTION_KEY` dùng `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
3. **GitHub Environment `production`**: set `VERCEL_TOKEN`, `VERCEL_TEAM_ID`, `VERCEL_PROJECT_ID`, `RENDER_API_KEY`, `RENDER_SERVICE_ID`; có thể bật required reviewers. Vercel Git auto-deploy và Render auto-deploy đều tắt; repo khóa thêm `git.deploymentEnabled.main=false`. Chỉ `deploy-production.yml` sau toàn bộ CI xanh mới deploy đúng SHA, đợi ready và smoke-check.
   - Frontend build phát public meta `<meta name="catevia-release" content="SHA">`; backend `/health` phát `releaseId` từ `APP_RELEASE_ID` hoặc Render `RENDER_GIT_COMMIT`. Hai giá trị chỉ là provenance, không phải secret.
   - Post-deploy gate fail nếu một release ID khác `VERIFIED_SHA`, `/api/auth/me` không trả 401 khi thiếu credential, hoặc frontend thiếu CSP/HSTS. Không bỏ qua gate bằng deploy tay; rollback bằng exact SHA xanh gần nhất.
   - OMR field evidence ADR-070 bind exact frontend release. `vite.config.ts` ưu tiên `VITE_APP_RELEASE_ID`, sau đó Vercel `VERCEL_GIT_COMMIT_SHA`; Vercel project phải bật **Automatically expose System Environment Variables**. Với build thủ công/host khác, đặt `VITE_APP_RELEASE_ID` thành full immutable Git SHA. Đây là public build metadata, không phải secret. Nếu runtime hiển thị `Release: dev`, System Diagnostics sẽ từ chối chuẩn bị field run.
4. **Mobile build**: `codemagic.yaml` + `.github/workflows/ios-ipa.yml` đã trỏ `VITE_API_BASE` sang Render domain.
   - Cả iOS/Android Codemagic truyền built-in `$CM_COMMIT` vào `VITE_APP_RELEASE_ID`; workflow IPA sideload truyền `${{ github.sha }}`. Không thay các giá trị này bằng số build tái sử dụng được, vì sequence qualification phải bind đúng source commit.

### 7.2 Đặc tính gói Render free — cần biết

- **Cold start**: service free có thể spin-down khi idle; request đầu có thể mất khoảng một phút. Refresh-cookie bootstrap dùng timeout **65 giây** và mọi request thường vẫn timeout 30 giây, nên UI không treo vô hạn. Repo không tự tạo keep-alive; nếu cần SLO production ổn định, nâng Render always-on là quyết định vận hành/chi phí và phải smoke-check lại `/health` qua Vercel.
- **Disk ephemeral**: KHÔNG lưu gì lâu dài trên container. Với Turso, scheduler tạo logical snapshot mã hóa và bắt buộc upload R2; thiếu R2/key sẽ báo backup failure, không giả thành công hoặc fallback local.
- **750 giờ/tháng**: đủ cho 1 service luôn bật.

### 7.2.1 Native privacy/build gate

- Android source đặt `allowBackup=false` và vẫn có `backup_rules.xml`/`data_extraction_rules.xml` loại toàn bộ cloud + device-transfer domains; không được nới rule cho IndexedDB/WebView data nếu chưa privacy review.
- OMR native chỉ xin camera; không xin microphone. Camera được khai báo optional vì đường chọn/tải ảnh là fallback bắt buộc.
- CI hiện chỉ chứng minh Android debug APK và iOS unsigned/TestFlight pipeline tùy workflow. Camera/biometric trên thiết bị, signed Android release và App Store artifact là external acceptance gates, không được suy diễn từ unit test.

### 7.3 Legacy — Railway (SUPERSEDED, không còn hoạt động)

- Domain cũ `tnttvn-production.up.railway.app` trả 404 nền tảng (`x-railway-fallback: true`, "Application not found") từ 2026-08-24 do hết hạn gói.
- Chẩn đoán lịch sử: xem Git history của tài liệu này trước 2026-08-25. Cơ chế nhận diện phản hồi backend không khả dụng: [API transport](../src/lib/api/core.ts) và [regression tests](../src/lib/__tests__/apiBackendUnavailable.test.ts).
- Nếu quay lại Railway: resume service + giữ nguyên kiến trúc SQLite volume, hoàn tác rewrite vercel.json về domain Railway.

## 7-BIS. [DEPRECATED] RAILWAY DEPLOYMENT NOTES (2026-08-15 → 2026-08-24)

> Toàn bộ mục này chỉ giữ lại để tham khảo khi quay về Railway. Cấu hình hiện hành là §7 (Render + Turso).

- `railway.json` dùng `"builder": "DOCKERFILE"` (**không phải Nixpacks**) → Railway chạy **cùng Dockerfile** nhưng **không có Nginx** đứng trước.
- Hệ quả bảo mật (A15): nếu publish thẳng cổng Node **KHÔNG được set `TRUST_PROXY`** — `getClientIp` fallback về socket IP thật (chống spoof header bypass rate limit).
- Muốn tin proxy header khi chạy Railway: đặt Cloudflare (hoặc proxy khác có kiểm soát) phía trước, rồi mới bật `TRUST_PROXY` khi chắc chắn proxy luôn ghi đè `X-Real-IP`.
- Frontend `vercel.json` định tuyến proxy `/api/:path*` $\rightarrow$ `https://tnttvn-production.up.railway.app/api/:path*` để chuyển tiếp an toàn mọi REST API methods (POST/GET/PUT/DELETE) về backend Railway, tránh lỗi 405 Method Not Allowed do static SPA fallback.
- **PWA freshness web-only (FE-07 + ADR-088, 2026-08-16/2026-09-01)**: `vercel.json` ép `Cache-Control: no-store` cho `/sw.js` và `no-cache, no-store` cho `/index.html`; `pushManager` đăng ký SW web với `updateViaCache: 'none'`; SW có `skipWaiting()` + `clientsClaim()` và **tự động reload mọi tab web đang mở** khi có build mới activate (trừ `/login`). Hệ quả: sau mỗi deploy web, tab cũ nhảy lên build mới — tránh JS cũ làm sai dashboard/sync. `vite.config.ts` đặt `injectRegister: false` để plugin không chèn registration ngoài runtime policy. Capacitor native không đăng ký SW, dọn legacy worker/cache PWA ở startup và nhận asset mới qua APK/IPA; vì vậy không còn reload giữa phiên do worker activate. Nếu tab web treo quá lâu, hard refresh 1 lần (`Ctrl+Shift+R` / Clear site data).

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

Web push (thông báo trình duyệt) chỉ hoạt động khi server có cặp VAPID keys. **Thiếu keys → từ 2026-08-28 `GET /api/notifications/vapid-public-key` trả 200 `{ data: { publicKey: null, configured:false } }` (không còn 501 spam — browser không log "Failed to load resource", `pushManager` chỉ `console.debug` và skip)** và client bỏ qua đăng ký push — fail-closed đúng thiết kế, không crash app. Legacy deploy cũ vẫn trả 501; client mới bắt cả hai để tương thích.

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
3. Verify: `curl https://<api-host>/api/notifications/vapid-public-key` với Bearer token → 200 `{ data: { publicKey, configured: true } }` (trước đó thiếu keys: 200 `{ data: { publicKey: null, configured:false } }`; legacy 501 `VAPID_NOT_CONFIGURED`).
4. Client (đã login) sẽ tự đăng ký push ở lần reload/login kế tiếp — không cần thay đổi code.

> Lưu ý bảo mật: `VAPID_PRIVATE_KEY` là bí mật — không commit vào repo, không ghi vào log. Vòng đời key rò rỉ → generate lại cặp mới + set lại env: subscription cũ bị push service từ chối (signature không khớp `applicationServerKey` lúc subscribe) → `sendWebPushToParish` nhận lỗi và dọn subscription chết, client re-subscribe ở lần login/reload kế tiếp.

### 8.3 Native push setup — Android FCM + iOS APNs (ADR-095)

1. Firebase Console: đăng ký Android app `com.tnttvn.app`, tải `google-services.json`. Không commit file. Local đặt tạm tại `android/app/google-services.json`; Codemagic đặt base64 toàn file vào secret `FIREBASE_ANDROID_CONFIG` (workflow fail-closed nếu thiếu).
2. Firebase/Google Cloud: tạo service account chỉ đủ quyền gửi FCM, đặt JSON vào Render secret `FIREBASE_SERVICE_ACCOUNT_JSON`. Bật FCM HTTP v1 API. Server ký OAuth assertion RS256 và gọi HTTP v1 trực tiếp, không kéo Firebase Admin/Cloud Storage runtime.
3. Apple Developer: bật Push Notifications cho bundle `com.tnttvn.app`, tạo APNs Auth Key `.p8`, cập nhật provisioning profile dùng trong Codemagic. Set 5 biến `APNS_*` trên Render; production/TestFlight dùng `APNS_ENVIRONMENT=production`.
4. Chạy `npm run capacitor:sync`. Script hậu xử lý chuẩn hóa SwiftPM path do Capacitor CLI trên Windows có thể sinh dấu `\\` không hợp lệ trên macOS.
5. Verify engineering: TypeScript, tests, `cap sync`, Android `assembleDebug`. Verify acceptance bắt buộc trên thiết bị thật: Android 13 permission, app foreground/background/killed, token refresh, đổi account, logout/opt-out, click route nội bộ; iPhone sandbox trước rồi TestFlight production. Không dùng simulator để kết luận delivery APNs/FCM.

Token thiết bị là credential giao vận: server phải lưu để gửi nhưng không ghi log/audit, client không persist. Khi rotate Firebase/APNs credentials, redeploy server và chạy smoke test; không xóa hàng loạt token trừ khi provider xác nhận invalid/unregistered.

---


## 9. AUTOMATED & SNAPSHOT-SAFE DATABASE BACKUP (INF-01, INF-02, INF-03)

### 9.1 Cơ Chế Sao Lưu Nhất Quán (Snapshot-Consistent)
SQLite local sử dụng cơ chế fail-closed ở chế độ WAL (`PRAGMA journal_mode=WAL`):
1. **Checkpoint chuẩn bị**: thử `PRAGMA wal_checkpoint(TRUNCATE)`. Nếu checkpoint lỗi, scheduler ghi warning nhưng vẫn có thể tiếp tục vì `VACUUM INTO` tự tạo snapshot nhất quán từ kết nối SQLite.
2. **Snapshot và publish**: chạy `VACUUM INTO` vào unique partial artifact, sau đó atomic rename thành file `.sqlite`. Chỉ artifact đã hoàn tất mới được upload và đưa vào retention.
3. **Không raw-copy fallback**: nếu `VACUUM INTO` hoặc rename lỗi, run trả failure, xóa partial artifact và không ghi `auto_backup_last_date`. Cấm copy riêng main DB vì committed pages có thể còn trong WAL.
4. **Chính Sách Lưu Trữ (Retention)**: Tự động giữ lại 5 bản sao lưu gần nhất (có thể cấu hình qua biến `BACKUP_RETENTION_COUNT`).

Contract snapshot/unique partial/rename/no raw-copy fallback cũng áp dụng cho standalone `scripts/backup-db.mjs` (`npm run db:backup`), không chỉ scheduler. CLI không publish hoặc prune khi VACUUM/rename thất bại; retention chỉ xét các artifact `parish-backup-*.sqlite` đã hoàn tất. Regression CLI dùng filesystem/libSQL fault injection, không thao tác DB thật.

Turso remote không hỗ trợ copy file/VACUUM. Scheduler mở read transaction, snapshot toàn bộ bảng ứng dụng, ghi row count + SHA-256, gzip rồi mã hóa AES-256-GCM bằng `BACKUP_ENCRYPTION_KEY` trước khi upload `backups/turso-*.json.gz.enc` lên R2. Thiếu key/R2 hoặc upload lỗi → run thất bại và marker ngày không được ghi.

### 9.2 Các Phương Thức Kích Hoạt
1. **Tự Động Nội Bộ (In-Process Scheduler - INF-02)**: Đăng ký cùng server Node.js (`backupScheduler.ts`), kiểm tra mỗi phút, mặc định từ 02:00 giờ host; chạy bù nếu lỡ cửa sổ và chưa có marker thành công trong ngày. Chỉ ghi `auto_backup_last_date` trong `system_settings` sau khi backup thành công. Tắt bằng `AUTO_BACKUP_ENABLED=false`. Không có tiến trình cron hay startup backup riêng.
2. **Thủ Công / CLI (INF-01)**:
   ```bash
   npm run db:backup # Chạy node scripts/backup-db.mjs
   ```
3. **Container / Cron Ngoại Vi**:
   File script được copy vào `/usr/local/bin/backup-db.mjs` trong Docker container để các trình lập lịch bên ngoài (nếu có) có thể gọi trực tiếp:
   ```bash
   node /usr/local/bin/backup-db.mjs
   ```

### 9.3 Restore drill Turso (không ghi production)

1. Tạo DB Turso cô lập, hoàn toàn mới và không chứa application table.
2. Set `RESTORE_DATABASE_URL`, `RESTORE_DATABASE_AUTH_TOKEN`, `BACKUP_ENCRYPTION_KEY`, đủ `R2_*`, và `ALLOW_BACKUP_RESTORE=true`. `RESTORE_DATABASE_URL` phải khác `TURSO_URL`.
3. Chuẩn hóa URL bằng cách bỏ query/hash/trailing slash, lowercase protocol/host; tính SHA-256 và set đúng giá trị vào `RESTORE_TARGET_FINGERPRINT`. Đây là xác nhận target lần hai, không dùng fingerprint của source/production.
4. Chạy `npm --prefix server run db:prepare:restore-target` với `DEPLOYMENT_PARISH_ID` đúng deployment nguồn. Command dùng cùng fingerprint/production guard, từ chối target đã có application table, áp bootstrap + migrations + indices. Sau đó kiểm đúng 4 default-fund seeds theo parish mà migration 261 đã chọn (cùng giá trị capture của migration module), xóa riêng chúng trong transaction và bắt buộc `assertDatabaseReady` pass. Bất kỳ seed/data ngoài dự kiến đều dừng; không dùng prepare làm công cụ xóa target cũ.
5. Chạy `npm --prefix server run db:restore:remote -- backups/<object-key>` trên target vừa chuẩn bị. CLI từ chối nếu bất kỳ table snapshot nào đã có dữ liệu (trừ `schema_migrations`) hoặc tập bảng/cột không khớp chính xác ở cả hai chiều. Backup schema cũ/thiếu bảng cần recovery/migration procedure riêng; không tự thêm phần thiếu từ trạng thái hiện tại.
6. Chỉ coi restore local gate thành công khi manifest JSON trả `status=verified`, `quarantined=true`, per-table row counts và nội dung từng dòng khớp (không phụ thuộc thứ tự SELECT), `foreignKeyViolations=0` và `assertDatabaseReady` pass. Ngoại lệ metadata duy nhất được khai báo/kiểm tra là một dòng `system_settings.__recovery_quarantine` mới: `restoredRows` chỉ đếm rows nguồn, `tableCounts` gồm cả marker. Manifest ghi riêng `phaseDurationMs.download/decrypt/restore/readiness`; RTO/RPO chỉ ghi sau khi owner phê duyệt measurement và phạm vi. Đối chiếu bảng bằng kết nối CLI cô lập; chưa được khởi động ứng dụng/đăng nhập smoke cho đến khi hoàn tất quy trình cutover bên dưới. Test full-schema local giữ policy/cohort/report/receipt qua finalize→promote→archive→encrypt→restore không thay thế drill R2→Turso thật, key recovery hoặc approval cutover.

CLI có hard guard từ chối target URL trùng production. Post-commit validation failure không tự rollback toàn target, vì vậy luôn discard target lỗi và tạo target mới; tuyệt đối không sửa chữa/cutover target đó. Không bypass guard và không dùng công cụ này thay cho quy trình cutover/approval riêng.

Full logical restore nạp lại **facts**, không replay lệnh nghiệp vụ: bên trong cùng write transaction, đọc định nghĩa trigger từ schema của target đã migrate, tạm gỡ trigger, nạp rows, rồi tạo lại và đối chiếu chính xác toàn bộ định nghĩa trigger trước commit. Không lấy SQL trigger từ backup. Lỗi load/recreate → rollback cả rows và thay đổi trigger; guard target rỗng, checksum, table/column match, CHECK/unique constraints, content readback, FK và readiness vẫn áp dụng. Cơ chế này giữ được lịch sử Operations có organizer hiện đã bị khóa và tránh phụ thuộc thứ tự nạp `operation_events/users`, `operation_tasks/operation_workstreams`; sau restore, trigger vẫn bảo vệ các lệnh ghi bình thường. Regression local với Operations có dữ liệu không thay thế drill Turso/R2 thực tế.

### Cutover after database rewind — separate mandatory approval

`status=verified` from restore certifies data fidelity only. The manifest explicitly returns `purpose=isolated-data-fidelity-drill`, `cutoverReady=false` and required gates. The CLI does not revoke sessions, advance client generation, reconcile delivery, or approve cutover. Do not point a normal application instance at a restored DB just because the manifest is verified.

The current remote restore CLI always writes a new `__recovery_quarantine` setting in the **same transaction** as the restored facts, after reinstating target triggers. Failure to write the marker rolls back the restore. A post-commit readback failure or lost CLI acknowledgement leaves the committed target quarantined. Readback verifies every source row plus this one declared metadata row; it does not claim a byte-identical database. A source snapshot already containing a quarantine marker is rejected by this CLI.

The application's shared DB connection checks marker presence before bootstrap/migrations, seeding, maintenance, worker registration and HTTP bind. Any marker, including malformed content or a different parish, aborts startup with `RECOVERY_QUARANTINED`; a database query error also aborts. There is no environment bypass, API release action or automated release command. This fence applies to the current application and current logical-restore CLI: it cannot retroactively mark older restores, detect a raw SQLite/provider rewind, stop an already-running process, or constrain an older binary/direct SQL connection. Isolated empty targets and infrastructure ingress/egress restrictions remain mandatory.

The recovery owner must record evidence for each gate before any traffic switch:

1. **Quarantine:** keep source and target URLs/fingerprints explicit; freeze intake to the old deployment when the owner approves the outage. Keep the restored target isolated, with no ordinary application process, public ingress or provider egress. Startup normally recovers notification delivery and registers business schedulers before HTTP; `AUTO_BACKUP_ENABLED=false` alone is **not** worker quarantine. Use CLI-only inspection while quarantined; do not invent a global worker-disable flag.
2. **Identity:** inventory account disables, password/role changes and recovery tickets after the snapshot; restored account rows can themselves rewind security decisions. Reconcile those decisions on the isolated target under an approved, audited procedure. Revoke all restored refresh sessions and rotate both access/refresh JWT secrets to fresh independent values on every serving instance before exposure. Incrementing restored `token_version` alone cannot guarantee invalidation of tokens from a later timeline. Keep report-signing and backup-encryption key recovery separate; do not casually rotate keys needed to validate historical reports or decrypt backups. Prove pre-rewind access/refresh credentials fail and an approved current account can log in.
3. **Clients:** record the highest pre-cutover `purge_version` from the source/operational evidence, then establish a strictly greater safe-integer generation on the target with an approved, tenant-scoped transaction. Incrementing only the restored value is insufficient. If a reliable upper bound is unavailable, stop: do not guess a timestamp or generation. Quarantine pending device work for owner review before any reset; generation reset can clear queues as well as caches. Verify a returning device cannot dispatch old work, clears/re-establishes cursors and cache, and performs a full pull. A fresh-device login smoke alone is insufficient. Devices that cannot complete this gate remain offline/quarantined.
4. **Delivery and automation:** compare restored pending/leased notifications, Operations reminders/dispatch state, Sunday reminders and outbox intent against provider/operational evidence after the snapshot. Do not blanket-replay, blanket-delete or mark uncertain delivery as sent. Approve each reconciliation outcome before allowing worker egress; if delivery evidence is missing, retain quarantine. Restore cannot establish exactly-once external delivery.
5. **Release:** retain the immutable original artifact and exact release/schema manifest; record target integrity/readiness, identity/client/delivery checks, owner approval and a rollback/forward-recovery decision. Once new writes reach the target, switching back to the old DB is another reconciliation event, not a safe automatic rollback. Re-enable ingress and workers only after every applicable gate passes.

Quarantine enforcement is implemented; reconciliation and release remain an operator contract, **not an implemented end-to-end cutover controller or evidence of a completed production drill**. Do not remove the marker merely to make startup pass. A reviewed release procedure must retain the quarantine evidence and prove all gates above before removing the fence. No production mutation is authorized by the restore CLI. Missing approvals, high-water marks, device evidence or delivery evidence keep cutover blocked.

### Partial academic JSON export

`POST /api/backup/export` remains admin + password re-authenticated, parish-scoped, and limited to the existing 14-table `2.1-question-bank` profile. All rows are materialized in one database transaction, ordered by ID, before response headers/bytes are sent. Download streaming then uses only the captured data, preserves counts/SHA-256, and holds no database transaction across network backpressure. Capture failure returns an error instead of a partial success-shaped download. This removes cross-page/table snapshot drift; it is still not a full-platform backup. Memory grows with the captured profile and large-dataset/remote-transaction capacity remains a deployment qualification gate.

### 9.3.1 Operations migration rehearsal trên backup SQLite

Trước khi rollout migrations Operations mới cho deployment dùng SQLite hoặc khi có một backup SQLite hợp lệ từ môi trường cần mô phỏng, chạy:

```bash
npm --prefix server run db:audit:operations-migration -- <finalized-backup.sqlite>
```

Trước migration rehearsal, chạy preflight thẩm quyền tổ chức ở chế độ read-only
trên chính bản sao đã chọn (không chạy writer và không tự sửa dữ liệu):

```bash
npm run audit:operations-authority
```

Đặt `AUDIT_DATABASE_URL`/`AUDIT_DATABASE_AUTH_TOKEN` để chỉ định bản sao audit.
Manifest mặc định băm parish/entity identifiers; chỉ đặt
`OPERATIONS_AUTHORITY_INVENTORY_INCLUDE_PARISH_ID=true` trong phiên kiểm soát nếu
cần ID giáo xứ rõ. Exit code khác 0 khi toàn giáo xứ không có đúng một BOARD active
và BOARD đó ở root, Ngành/Ban không
trực thuộc BOARD, leader term sai unit, thiếu staff account hợp lệ, chồng nhiệm kỳ
leader hoặc không có đúng một Trưởng Xứ đoàn đang hiệu lực. Công cụ không chọn
người thắng và không sửa production.

Manifest ghi `evaluatedOn` và `parishCount` để gắn kết quả với ngày đánh giá và
phạm vi inventory. Database không có giáo xứ trả finding `NO_PARISH_DATA` và
exit code khác 0; không dùng schema rỗng làm bằng chứng rollout đạt.

Phải xử lý mọi finding BOARD trước khi áp dụng migration `20260910-251`. Partial
unique index của migration này cố ý làm deployment fail nếu còn nhiều BOARD active;
không xóa, merge hoặc vô hiệu hóa BOARD tự động chỉ để migration chạy qua.

Thứ tự triển khai: chọn backup đã hoàn tất → audit thẩm quyền → quản trị viên
duyệt và xử lý finding trên dữ liệu nguồn bằng quy trình được phép → lấy backup
mới → audit lại → migration rehearsal → triển khai được phê duyệt → audit và
smoke test sau triển khai. Rehearsal kiểm tra duplicate BOARD trước khi chạy bất
kỳ migration nào, chỉ báo số giáo xứ bị ảnh hưởng, không xuất danh tính. Thiếu
BOARD hoặc leader vẫn là blocker triển khai nghiệp vụ dù rehearsal schema pass.

Command chỉ nhận artifact backup đã hoàn tất và từ chối chính `DB_PATH` hoặc `server/data/parish.db`. Nó không mở HTTP, không chạy worker nghiệp vụ và không sửa source: parent tạo thư mục tạm, worker riêng copy artifact rồi chạy full migration + defensive sync + indices. Gate bắt buộc gồm pre/post `PRAGMA integrity_check`, `PRAGMA foreign_key_check`, `assertDatabaseReady`, bảo toàn count + SHA-256 của toàn bộ giá trị thuộc các cột `operation_*` có trước migration, và một recovery snapshot `VACUUM INTO` phải khớp bản đã migrate. Manifest chỉ xuất tên artifact, counts, hashes và phase durations; không xuất row data.

`status=verified` chỉ là LAB evidence cho exact artifact được hash trong manifest. Không dùng command này thay cho Turso/R2 drill ở §9.3, không suy ra RTO/RPO và không chạy trực tiếp vào database live. Với backup cũ hơn schema hiện tại, failure phải được xử lý bằng forward fix trên một bản sao mới; không xóa migration marker hoặc down-migrate artifact để ép pass.

### 9.4 Read-only preflight trước production operations

- `npm run audit:promotion-reconciliation`: chỉ mở read transaction, không chạy bootstrap/migration và không xuất student ID. Báo `legacy_unbound`, `retryable_backlog` hoặc `archived_incomplete`; parish ID mặc định được hash. Chỉ bật `PROMOTION_INVENTORY_INCLUDE_PARISH_ID=true` trong terminal vận hành được kiểm soát.
- `npm run audit:roster-integrity`: read transaction duy nhất, không bootstrap/migration/write. Báo candidate duplicate theo normalized-name + DOB thật, branch/class mismatch, reference tới class đã xóa, cardinality/stale assignment, alias lớp trùng qua năm, batch cần recovery và lớp active rỗng. Output chỉ có counts/metadata và reference SHA-256 rút gọn; finding là danh sách cần người vận hành review, không phải lệnh merge/move/delete tự động.
- `npm run audit:sunday-readiness`: chỉ đọc các parish đã explicit opt-in, giờ lễ, số parent recipients và số endpoint Web/native; không enqueue và không ghi sent marker. Parish ID mặc định được hash. Actual Sunday smoke vẫn là external action có thể gửi thật và phải chọn parish/time rõ ràng.
