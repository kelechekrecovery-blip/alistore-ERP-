FROM node:22-bookworm-slim AS build
WORKDIR /app
# postgresql-client из Debian 12 — это версия 15, а прод-БД (render.yaml
# postgresMajorVersion: "16") новее. pg_dump отказывается снимать дамп с сервера
# старшей версии, поэтому ночной крон alistore-backup-prod падал бы каждый раз,
# оставляя деплой зелёным. Ставим клиент 16 из PGDG.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates curl gnupg \
 && install -d /usr/share/postgresql-common/pgdg \
 && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
      -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
 && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
      > /etc/apt/sources.list.d/pgdg.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends postgresql-client-16 \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/mobile/package.json apps/mobile/package.json
RUN npm ci
COPY . .
RUN npm run prisma:generate -w @alistore/api && npm run api:build

ENV NODE_ENV=production
# main.ts берёт `process.env.PORT ?? 4000`. Render свой PORT инжектит, но без
# этой строки образ вне Render слушал бы 4000 при EXPOSE 10000 — рассогласование,
# которое проявляется только там, где PORT не задан.
ENV PORT=10000
EXPOSE 10000
CMD ["npm", "run", "start:prod", "-w", "@alistore/api"]
