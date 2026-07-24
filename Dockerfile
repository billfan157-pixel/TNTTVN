# ─── Build Stage ───
FROM node:24-alpine AS builder

WORKDIR /app

# Copy dependency configs
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build production bundle & TypeScript server
RUN npm run build

# ─── Production Stage ───
FROM node:24-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

# Copy built assets & dependencies
COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server/dist ./server/dist

EXPOSE 3001

CMD ["node", "server/dist/index.js"]
