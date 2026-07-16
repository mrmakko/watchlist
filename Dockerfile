# Build the Svelte client with the development toolchain, then discard it.
FROM node:22-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY svelte.config.js vite.config.js ./
COPY web ./web
RUN npm run build

# Keep only dependencies needed by the Express server in the runtime image.
RUN npm prune --omit=dev && npm cache clean --force


FROM node:22-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

# Dokku supplies PORT; 5000 matches this app's existing proxy mapping for direct runs.
ENV PORT=5000
EXPOSE 5000

COPY --from=build /app/node_modules ./node_modules
COPY package.json ./package.json
COPY server ./server
COPY --from=build /app/web/dist ./web/dist
COPY data/watchlist.example.json ./data/watchlist.example.json

# /app/data is intentionally left writable for Dokku's persistent storage mount.
CMD ["node", "server/index.js"]
