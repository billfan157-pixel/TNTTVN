# ─── Build Stage ───
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency configs
COPY package*.json ./
COPY server/package*.json ./server/

# Use latest npm to avoid peer-dep resolution bugs in npm 10
RUN npm install -g npm@latest && npm ci && cd server && npm ci

# Copy source code
COPY . .

# Build production bundle for both client & server
RUN npm run build

# ─── Production Stage ───
FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

# Install cron for scheduled backups
RUN apk add --no-cache dcron

# Copy server dependency configs & install production dependencies only
COPY server/package*.json ./server/
RUN npm install -g npm@latest && cd server && npm ci --omit=dev

# Create node user for non-root execution
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy built dist outputs
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server/dist ./server/dist
COPY scripts/backup-db.js /usr/local/bin/backup-db.js
COPY scripts/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Ensure data directory is writable by non-root user
RUN mkdir -p /app/data && chown -R appuser:appgroup /app/data

USER appuser

EXPOSE 3001

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
