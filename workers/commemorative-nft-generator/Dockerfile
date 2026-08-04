FROM mcr.microsoft.com/playwright:v1.58.2-noble AS dependencies

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY workers/commemorative-nft-generator/package.json workers/commemorative-nft-generator/package.json
RUN pnpm install --frozen-lockfile --filter commemorative-nft-generator --ignore-scripts

FROM dependencies AS build
COPY workers/commemorative-nft-generator workers/commemorative-nft-generator
RUN pnpm --filter commemorative-nft-generator build

FROM mcr.microsoft.com/playwright:v1.58.2-noble
WORKDIR /app
ENV NODE_ENV=production
ENV NVIDIA_VISIBLE_DEVICES=all
ENV NVIDIA_DRIVER_CAPABILITIES=compute,graphics,utility,video
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/workers/commemorative-nft-generator/node_modules ./workers/commemorative-nft-generator/node_modules
COPY --from=build /app/workers/commemorative-nft-generator/dist ./workers/commemorative-nft-generator/dist
EXPOSE 3000
USER pwuser
CMD ["node", "workers/commemorative-nft-generator/dist/server.js"]
