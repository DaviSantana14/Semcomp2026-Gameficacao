FROM node:22-bookworm-slim AS dependencies

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json

RUN npm ci

FROM dependencies AS build

WORKDIR /app

COPY . .

ARG NEXT_PUBLIC_API_URL=/api
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN npm --workspace web run build

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/public ./apps/web/public
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static

USER node

CMD ["node", "apps/web/server.js"]
