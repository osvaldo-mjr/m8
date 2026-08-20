# The Node version lives in .nvmrc. This ARG default is a second, necessary
# copy of it — Dockerfile syntax cannot read another file — but the two are
# not left free to drift: `npm run check:node-version` (run by `npm run
# docker`, and asserted again in scripts/node-version.test.ts as part of the
# ordinary test suite) fails loudly the moment this value and .nvmrc disagree.
ARG NODE_VERSION=26
FROM node:${NODE_VERSION}-alpine AS deps
WORKDIR /app

# Manifests only, so that editing source never invalidates this layer —
# only an actual dependency change does. Verbose because the workspace list
# is: the root manifest, then one package.json per workspace.
COPY package.json package-lock.json ./
COPY packages/core/package.json ./packages/core/package.json
COPY packages/protocol/package.json ./packages/protocol/package.json
COPY packages/tokens/package.json ./packages/tokens/package.json
COPY packages/transport/package.json ./packages/transport/package.json
COPY apps/server/package.json ./apps/server/package.json
COPY apps/tv/package.json ./apps/tv/package.json
COPY apps/phone/package.json ./apps/phone/package.json
RUN npm ci

FROM deps AS build
WORKDIR /app
COPY packages ./packages
COPY apps ./apps
RUN npm run build

FROM node:${NODE_VERSION}-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps ./apps
COPY --from=build /app/package.json ./package.json
USER node
EXPOSE 3000
CMD ["npx", "tsx", "apps/server/src/main.ts"]
