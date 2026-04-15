FROM node:22-bookworm-slim AS build

ARG VITE_API_BASE_URL

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/tsconfig.json apps/web/vite.config.ts apps/web/index.html ./apps/web/
COPY apps/web/public ./apps/web/public
COPY apps/web/src ./apps/web/src

RUN npm ci

ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

RUN npm run build --workspace @ai-image-app/web

FROM nginx:1.27-alpine

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80
