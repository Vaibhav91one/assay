# One image, two entrypoints. `web` serves; `worker` scrapes. They share the
# engine, so they share a build -- the alternative is two images that can drift
# apart on the one module whose whole point is running identically everywhere.
#
# OCI-standard on purpose: builds unchanged under Docker, Podman and Apple
# Container.
#
# Note the explicit COPY list instead of `COPY . .`. npm workspaces creates
# web/node_modules/assay -> ../.. (a self-link back to the repo root). Apple
# Container's build-context transfer walks that link and fails with
# "<parent> is not a child of <root>" -- and it fails during *transfer*, before
# .dockerignore is consulted, so no ignore pattern can prevent it. Naming the
# paths sidesteps the walk entirely and keeps the image lean either way.

FROM node:22-alpine AS build
WORKDIR /app

# Manifests first so a dependency-free code change reuses the install layer.
COPY package.json package-lock.json ./
COPY web/package.json web/package.json
RUN npm ci

COPY src ./src
COPY tools ./tools
COPY drizzle.config.ts tsconfig.json ./
COPY web/app ./web/app
COPY web/lib ./web/lib
COPY web/next.config.ts web/tsconfig.json web/next-env.d.ts web/postcss.config.mjs web/proxy.ts ./web/
RUN npm --workspace web run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

# Dev dependencies stay: `drizzle-kit migrate` is how the schema lands, and it
# is a devDependency. Pruning would mean a second image just to run migrations.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/web ./web
COPY package.json package-lock.json drizzle.config.ts tsconfig.json ./
COPY src ./src
COPY tools ./tools
# The CLIs (bench, replay, selftest) read the archived corpus; without it the
# reproducibility claims cannot be checked from inside the container.
COPY corpus ./corpus

RUN mkdir -p /data/captures
ENV ASSAY_CAPTURES=/data/captures

EXPOSE 3000
CMD ["npm", "--workspace", "web", "run", "start"]
