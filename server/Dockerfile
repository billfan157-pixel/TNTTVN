FROM node:24-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx tsc --noEmit

FROM node:24-alpine AS runner
WORKDIR /app
RUN apk add --no-cache sqlite
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/src ./src
COPY --from=builder /app/drizzle.config.ts ./
EXPOSE 3001
ENV NODE_ENV=production
CMD ["npx", "tsx", "src/index.ts"]
