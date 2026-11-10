# The real Boloka prototype as one server: built app + API + Chrome (the test
# anchor's SEP-24 pages are completed in a hidden browser). Testnet only.
FROM node:24-bookworm-slim

# Chromium for puppeteer-core, plus the fonts/libs it needs.
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium fonts-liberation ca-certificates \
    && rm -rf /var/lib/apt/lists/*
ENV CHROME_PATH=/usr/bin/chromium

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
# VITE_* values from .env are baked into the bundle here.
RUN npx vite build

ENV NODE_ENV=production PORT=8080 DATA_DIR=/data
EXPOSE 8080
CMD ["node", "server/serve.ts"]
