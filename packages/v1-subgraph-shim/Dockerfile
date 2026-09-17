# Runs straight off the TypeScript sources: Node strips types natively, which is
# the same thing `pnpm start` does locally, so there is no build step that can
# drift from what a developer runs.
FROM node:22-alpine

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-package-lock
COPY server ./server

ENV PORT=5656
EXPOSE 5656
CMD ["node", "server/index.ts"]
