# DQA overlay service. Standalone image: the package has no workspace deps,
# so the build context is just this directory (see e2e/infra/docker-compose.yml).
# TypeScript sources run directly via Node's native type stripping (>=22.18) —
# no build/transpile step, no dev dependencies in the image.
#
#   docker build -t dqa-server packages/dqa-server
#   docker run -p 4000:4000 -v dqa-data:/app/data --env-file .env dqa-server
FROM node:22-alpine

WORKDIR /app

COPY package.json ./
# Runtime needs only the prod deps (express/multer/ws); TypeScript runs via
# Node's native type stripping, no transpile. devDependencies use pnpm's
# `catalog:` protocol which plain npm can't parse, so strip them first — the
# image never needs them.
RUN npm pkg delete devDependencies && npm install --omit=dev --no-audit --no-fund

COPY server ./server
COPY public ./public

# Comments + uploads live here; mount a volume to persist across restarts.
RUN mkdir -p /app/data/uploads
VOLUME /app/data

ENV PORT=4000
EXPOSE 4000

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
  CMD wget -q --spider http://localhost:4000/auth/config || exit 1

CMD ["node", "server/index.ts"]
