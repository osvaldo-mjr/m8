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
# is: the root manifest, then one package.json per workspace. Every workspace
# must appear: a missing one still installs (npm leaves a link that resolves
# once the source is copied in a later stage), but its dependency changes
# then stop invalidating this layer, which is the whole point of the split.
# scripts/dockerfile-manifests.test.ts fails if a workspace is added without
# a line here.
COPY package.json package-lock.json ./
COPY packages/avatars/package.json ./packages/avatars/package.json
COPY packages/contract/package.json ./packages/contract/package.json
COPY packages/core/package.json ./packages/core/package.json
COPY packages/games/chess/package.json ./packages/games/chess/package.json
COPY packages/games/dominoes/package.json ./packages/games/dominoes/package.json
COPY packages/games/draughts/package.json ./packages/games/draughts/package.json
COPY packages/games/tic-tac-toe/package.json ./packages/games/tic-tac-toe/package.json
COPY packages/protocol/package.json ./packages/protocol/package.json
COPY packages/tokens/package.json ./packages/tokens/package.json
COPY packages/transport/package.json ./packages/transport/package.json
COPY apps/server/package.json ./apps/server/package.json
COPY apps/tv/package.json ./apps/tv/package.json
COPY apps/phone/package.json ./apps/phone/package.json
RUN npm ci

FROM deps AS build
WORKDIR /app
# apps/tv/tsconfig.json is read by the large screen's bundler, and it extends
# this file. Without it here the TV build fails outright rather than falling
# back to a default, so the two travel together.
COPY tsconfig.base.json ./tsconfig.base.json
COPY packages ./packages
COPY apps ./apps
RUN npm run build

# The same manifests, installed again with the development half left out.
# Built as its own stage rather than by pruning in place, because `npm ci`
# wipes node_modules first: nothing a development install left behind — the
# second copy of tailwind under apps/phone, vite, typescript — can survive
# into the tree the runtime image copies.
#
# This is why `tsx` is a dependency of @m8/server and not a devDependency:
# the server runs TypeScript source, so its loader is part of how the server
# runs, not part of how it is developed. A prune that dropped it would
# produce an image that builds and then cannot start.
#
# React and socket.io-client survive here, declared as they are by the phone
# and the large screen. Both are already inside their built bundles and
# neither is loaded at runtime; removing them would mean reclassifying a
# browser app's real dependencies to suit the server's image, which is a
# worse lie than a few unused megabytes.
FROM deps AS prod-deps
WORKDIR /app
RUN npm ci --omit=dev

FROM node:${NODE_VERSION}-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
# Copied file by file rather than whole directories, so that neither a
# development node_modules nor the large screen's and phone's TypeScript
# sources ride along. The server runs from source; the two browser apps ship
# only their built output, which is all that is ever served. Each manifest
# comes too, so the workspace links under node_modules point at something.
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/server/package.json ./apps/server/package.json
COPY --from=build /app/apps/server/src ./apps/server/src
COPY --from=build /app/apps/tv/package.json ./apps/tv/package.json
COPY --from=build /app/apps/tv/dist ./apps/tv/dist
COPY --from=build /app/apps/phone/package.json ./apps/phone/package.json
COPY --from=build /app/apps/phone/dist ./apps/phone/dist
USER node
EXPOSE 3000
# `node --import tsx`, not `npx tsx`, for two reasons.
#
# `npx` fetches from the network when the binary it is asked for is missing,
# so a broken image would quietly reach out to a registry at container start
# instead of failing where it can be seen. (`npx --no` refuses instead, but
# does not help with the second reason.)
#
# And this process is PID 1. `npx` would run the server as its child, and a
# `docker stop` sends SIGTERM to PID 1 only: the signal would land on the
# wrapper, the server would never hear it, and every stop would wait out the
# ten-second timeout before being killed. Started this way, the server *is*
# PID 1, so the SIGTERM handler in main.ts is the thing that receives it.
CMD ["node", "--import", "tsx", "apps/server/src/main.ts"]
