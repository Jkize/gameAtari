FROM node:24.18.0-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY nest-cli.json tsconfig*.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src

RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npm run prisma:generate \
    && npm run build

FROM node:24.18.0-alpine AS production-dependencies

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npm ci --omit=dev \
    && DATABASE_URL=postgresql://build:build@localhost:5432/build npm run prisma:generate \
    && npm cache clean --force

FROM node:24.18.0-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    NODE_OPTIONS=--max-old-space-size=640

COPY --chown=node:node package*.json ./
COPY --chown=node:node --from=production-dependencies /app/node_modules ./node_modules
COPY --chown=node:node --from=production-dependencies /app/prisma ./prisma
COPY --chown=node:node --from=production-dependencies /app/prisma.config.ts ./prisma.config.ts
COPY --chown=node:node --from=build /app/dist ./dist

EXPOSE 3000

USER node
CMD ["node", "dist/main.js"]
