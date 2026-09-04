# Morada — production image for Render (or any Docker host).
#
# Two system binaries have to be present or features fail at runtime rather
# than at build time, which is why they are installed explicitly rather than
# left to a buildpack:
#
#   pdftoppm (poppler-utils) — server/services/aiBillReader.ts shells out to it
#                              to rasterise PDF bills before sending them to
#                              Claude. Without it, AI bill reading fails on
#                              every PDF, which is most of them.
#   chromium                 — Puppeteer, for the Selections Schedule PDF.
#
# On Replit these came from `[nix] packages = ["poppler_utils"]` and whatever
# Chromium the container happened to have.

FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      poppler-utils \
      chromium \
      ca-certificates \
      fonts-liberation \
      fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

# Use the Chromium installed above instead of letting Puppeteer download its
# own (~300 MB, and it would want shared libraries this slim image lacks).
# Puppeteer reads PUPPETEER_EXECUTABLE_PATH natively, so no code change is
# needed — routes.ts calls puppeteer.launch() with no executablePath.
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Dependencies first, so this layer survives source-only changes.
COPY package.json package-lock.json .npmrc ./

# NODE_ENV is deliberately NOT production here. The build needs Vite, esbuild
# and the Vite plugins — all devDependencies — so installing without them
# breaks `npm run build`, not just the server.
RUN npm ci --no-audit --no-fund

COPY . .

# vite build   -> dist/public   (client)
# esbuild      -> dist/index.js (server)
RUN npm run build

# Safe to switch only now. dist/index.js has no devDependency anywhere in its
# import graph — Vite is reached through a dynamic import that only the
# development branch takes. See the header of server/serveStatic.ts.
#
# That also means this image could be slimmed with a multi-stage build that
# ships only production dependencies. Deliberately not done yet: it should be
# a separate change, verified on its own, rather than folded into the move.
ENV NODE_ENV=production

# Render injects PORT and the server reads it (server/index.ts). 5000 is only
# the documented default for a plain `docker run`.
ENV PORT=5000
EXPOSE 5000

CMD ["npm", "run", "start"]
