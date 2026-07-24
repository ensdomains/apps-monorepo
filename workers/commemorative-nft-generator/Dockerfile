FROM mcr.microsoft.com/playwright:v1.58.2-noble AS build

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY workers/commemorative-nft-generator/package.json workers/commemorative-nft-generator/package.json
RUN pnpm install --frozen-lockfile --filter commemorative-nft-generator --ignore-scripts

COPY workers/commemorative-nft-generator workers/commemorative-nft-generator
RUN pnpm --filter commemorative-nft-generator build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "workers/commemorative-nft-generator/dist/server.js"]
