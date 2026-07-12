FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/mobile/package.json apps/mobile/package.json
RUN npm ci
COPY . .
ARG NEXT_PUBLIC_API_BASE=https://api.alistore.kg/api
ARG NEXT_PUBLIC_DEMO_MODE=true
ENV NEXT_PUBLIC_API_BASE=$NEXT_PUBLIC_API_BASE
ENV NEXT_PUBLIC_DEMO_MODE=$NEXT_PUBLIC_DEMO_MODE
RUN npm run build -w @alistore/web

ENV NODE_ENV=production
ENV PORT=10000
EXPOSE 10000
CMD ["sh", "-c", "npm exec -w @alistore/web -- next start -p ${PORT}"]
