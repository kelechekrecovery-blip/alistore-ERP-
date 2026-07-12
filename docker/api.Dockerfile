FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl postgresql-client ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/mobile/package.json apps/mobile/package.json
RUN npm ci
COPY . .
RUN npm run prisma:generate -w @alistore/api && npm run api:build

ENV NODE_ENV=production
EXPOSE 10000
CMD ["npm", "run", "start:prod", "-w", "@alistore/api"]
