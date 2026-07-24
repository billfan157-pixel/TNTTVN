# ─── Build Stage ───
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency configs
COPY package*.json ./
COPY server/package*.json ./server/

# Install dependencies for client and server
RUN npm ci && cd server && npm ci

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

# Copy dependency configs & install production dependencies
COPY package*.json ./
COPY server/package*.json ./server/
RUN npm ci --omit=dev && cd server && npm ci --omit=dev

# Copy built dist outputs
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server/dist ./server/dist
COPY scripts/backup-db.js /usr/local/bin/backup-db.js
COPY scripts/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 3001

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
