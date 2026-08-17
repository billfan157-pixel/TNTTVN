# ─── Build Stage ───
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency configs
COPY package*.json ./
COPY server/package*.json ./server/
# A-NEW-27: xlsx là file: dep (vendor/) — bắt buộc có trước npm ci
COPY vendor/ ./vendor/

# Use latest npm to avoid peer-dep resolution bugs in npm 10
# A-NEW-27 (2026-08-11): xlsx đã VENDOR vào vendor/xlsx-0.20.3.tgz (file: dep —
# xác thực sha512 khớp integrity trong package-lock) — build không còn phụ thuộc
# CDN sheetjs.com; vendor/ phải có mặt TRƯỚC npm ci.
# A-NEW-08 (2026-08-10): npm 11.15+/12 chặn remote tarball mặc định (EALLOWREMOTE)
# — giữ --allow-remote=all an toàn cho mọi npm ci (không còn dep remote nhưng
# flag không gây hại).
# A-NEW-16 (2026-08-11): PIN npm@11.15.0 thay vì @latest — build reproducible
# (npm@latest có thể đổi bất kỳ lúc nào → cùng code, khác lỗi build).
RUN npm install -g npm@11.15.0 \
    && (if [ -f package-lock.json ]; then npm ci --allow-remote=all; else npm install --allow-remote=all; fi) \
    && cd server \
    && (if [ -f package-lock.json ]; then npm ci --allow-remote=all; else npm install --allow-remote=all; fi)

# Copy source code
COPY . .

# Build production bundle for both client & server
RUN npm run build

# ─── Production Stage ───
FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV DB_PATH=/app/data/parish.db

# Copy server dependency configs & install production dependencies only
# A-NEW-16: pin npm@11.15.0 (cùng version với build stage — reproducible).
COPY server/package*.json ./server/
RUN npm install -g npm@11.15.0 \
    && cd server \
    && (if [ -f package-lock.json ]; then npm ci --omit=dev --allow-remote=all; else npm install --omit=dev --allow-remote=all; fi)

# Create node user for non-root execution
RUN addgroup -S appgroup && adduser -S appuser -G appgroup \
    && apk add --no-cache su-exec

# Copy built dist outputs
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server/dist ./server/dist
COPY scripts/backup-db.mjs /usr/local/bin/backup-db.mjs
COPY scripts/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Ensure data directory is writable by non-root user
RUN mkdir -p /app/data && chown -R appuser:appgroup /app/data

# NOTE: entrypoint.sh chạy như ROOT (không USER appuser ở đây) để có thể
# chown lại volume mount /app/data của Railway (volume che phủ thư mục image,
# owner mặc định root → appuser không mở được SQLite = SQLITE_CANTOPEN),
# sau đó tự su-exec xuống appuser trước khi chạy server.

EXPOSE 3001

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
