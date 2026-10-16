# Reproduces every offline table with no network at run time: docker run --rm --network none agent-silent-failures
FROM node:24.22.0-bookworm-slim

ENV NODE_ENV=production \
    MASTRA_TELEMETRY_DISABLED=1 \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
USER node
WORKDIR /home/node/app

COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod=false

# The model download needs only these modules and the installed dependencies, so it caches apart from the source.
COPY --chown=node:node src/trace/model.ts src/trace/model.ts
COPY --chown=node:node src/harness/embedder/model-files.ts src/harness/embedder/model-files.ts
COPY --chown=node:node scripts/download-embedding-model.ts scripts/download-embedding-model.ts
RUN pnpm model:download

COPY --chown=node:node . .
# One demo run at build time fills the embedding cache, so `docker run` skips the cold embedding pass.
RUN pnpm demo > /dev/null

CMD ["pnpm", "demo"]
