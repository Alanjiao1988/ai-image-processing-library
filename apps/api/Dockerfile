FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/tsconfig.json ./apps/api/
COPY apps/api/prisma ./apps/api/prisma

RUN npm ci

COPY apps/api/src ./apps/api/src

RUN npm run db:generate && npm run build --workspace @ai-image-app/api

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

COPY --from=build /app/package.json /app/package-lock.json /app/tsconfig.base.json ./
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/node_modules ./node_modules

EXPOSE 3001

CMD ["sh", "-c", "node ./node_modules/prisma/build/index.js db push --schema apps/api/prisma/schema.prisma && npm run start --workspace @ai-image-app/api"]
