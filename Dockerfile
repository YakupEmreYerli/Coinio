# syntax=docker/dockerfile:1

# Builds the web app and server, then ships only what runs: dist/ and production dependencies.
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable && corepack prepare pnpm@12.18.0 --activate
WORKDIR /app

# Native modules (better-sqlite3) compile here when no prebuilt binary fits the platform.
FROM base AS deps
RUN apk add --no-cache python3 make g++
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm build

FROM deps AS prod-deps
# Drop what never runs: SQLite C sources and simple-icons' loose SVGs (the app reads index.js).
RUN pnpm prune --prod \
 && rm -rf node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3/deps \
           node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3/src \
           node_modules/.pnpm/simple-icons@*/node_modules/simple-icons/icons

FROM node:22-alpine
RUN apk add --no-cache su-exec
ENV NODE_ENV=production PORT=8080 COINIO_DATA_DIR=/data
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY docker-entrypoint.sh /usr/local/bin/
RUN mkdir -p /data && chown node:node /data
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/server/index.js"]
