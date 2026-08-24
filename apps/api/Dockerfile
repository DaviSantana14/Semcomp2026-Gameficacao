FROM node:22-bookworm-slim AS base

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

FROM base AS dependencies

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json

RUN npm ci

FROM dependencies AS build

WORKDIR /app

COPY . .

# Prisma config validates these build-only placeholders while generating the
# client. They never enter an image layer environment.
RUN DB_HOST=build-db DB_PORT=5432 DB_NAME=semcomp DB_USER=semcomp DB_PASSWORD=semcomp DB_SCHEMA=public npm --workspace api run prisma:generate
RUN npm --workspace api run build

FROM base AS runtime

WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/apps/api ./apps/api

# Fail the image build if bcrypt cannot load in the final runtime distribution.
RUN node -e "require('bcrypt')"

USER node

CMD ["node", "apps/api/dist/src/main.js"]
