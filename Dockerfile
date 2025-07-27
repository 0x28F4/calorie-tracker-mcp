FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

FROM node:20-alpine

RUN apk add --no-cache dumb-init

RUN addgroup -g 1001 -S appuser && \
    adduser -S appuser -u 1001

WORKDIR /app

COPY package*.json ./

RUN npm ci --only=production && \
    npm cache clean --force

COPY --from=builder /app/dist ./dist

RUN mkdir -p /app/data && \
    chown -R appuser:appuser /app

USER appuser

EXPOSE 3000

ENV NODE_ENV=production
ENV TRANSPORT=http
ENV DATABASE_PATH=/app/data/calorie_tracker.db

ENTRYPOINT ["dumb-init", "--"]

CMD ["node", "dist/index.js"]