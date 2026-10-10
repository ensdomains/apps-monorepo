# Runs straight off the TypeScript sources: Node strips types natively, which is
# the same thing `pnpm start` does locally, so there is no build step that can
# drift from what a developer runs.
FROM node:22-alpine

WORKDIR /app
COPY package.json ./
# npm cannot read pnpm's `catalog:` versions, and the build context is this
# package alone, so pin them to pnpm-workspace.yaml's catalog here. Keep these
# in step with the catalog.
RUN sed -i \
      -e 's#"@ensdomains/ensjs": "catalog:"#"@ensdomains/ensjs": "^5.0.0"#' \
      -e 's#"viem": "catalog:"#"viem": "^2.52.2"#' \
      -e 's#"typescript": "catalog:"#"typescript": "^7.0.2"#' \
      package.json \
    && npm install --omit=dev --no-package-lock
COPY server ./server

ENV PORT=5656
EXPOSE 5656
CMD ["node", "server/index.ts"]
