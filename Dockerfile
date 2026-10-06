# Chromium is the reason this image is not tiny: the charts are rendered by
# screenshotting real HTML. Everything else here is small.
FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    DB_PATH=/data/fitness.db

WORKDIR /app

# Install deps first so a code change does not re-download Chromium.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts \
 && npx playwright install --with-deps chromium \
 && npm cache clean --force

COPY tsconfig.json ./
COPY src ./src

# Build to plain JS so the image does not ship a TypeScript loader.
RUN npm ci --ignore-scripts \
 && npx tsc \
 && npm prune --omit=dev \
 && npm cache clean --force

# SQLite lives on a mounted volume; without one the history dies on redeploy.
VOLUME ["/data"]

CMD ["node", "dist/index.js"]
