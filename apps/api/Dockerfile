FROM node:20-alpine

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/api/tsconfig.json apps/api/
COPY apps/api/prisma apps/api/prisma
COPY apps/api/src apps/api/src
COPY packages/shared/package.json packages/shared/
COPY packages/shared/tsconfig.json packages/shared/
COPY packages/shared/src packages/shared/src

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @guiguan/api exec prisma generate
RUN pnpm --filter @guiguan/api build

EXPOSE 3001

CMD ["pnpm", "--filter", "@guiguan/api", "start"]
