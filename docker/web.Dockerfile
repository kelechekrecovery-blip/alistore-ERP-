FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/mobile/package.json apps/mobile/package.json
RUN npm ci
COPY . .
# ВНИМАНИЕ: Next впекает NEXT_PUBLIC_* в клиентский бандл на СБОРКЕ, а Render не
# умеет передавать docker build args из блюпринта. Поэтому источник правды для
# этих значений — дефолты ARG ниже, а не одноимённые переменные в render.yaml:
# те действуют только в рантайме сервера и на уже собранный бандл не влияют.
# Менять адрес API или демо-режим витрины нужно ЗДЕСЬ.
ARG NEXT_PUBLIC_API_BASE=https://api.ali.kg/api
ARG NEXT_PUBLIC_DEMO_MODE=true
ARG NEXT_PUBLIC_SITE_URL=https://ali.kg
ENV NEXT_PUBLIC_API_BASE=$NEXT_PUBLIC_API_BASE
ENV NEXT_PUBLIC_DEMO_MODE=$NEXT_PUBLIC_DEMO_MODE
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
RUN npm run build -w @alistore/web

ENV NODE_ENV=production
ENV PORT=10000
EXPOSE 10000
CMD ["sh", "-c", "npm exec -w @alistore/web -- next start -p ${PORT}"]
