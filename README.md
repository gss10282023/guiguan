# guiguan

## 环境要求

- Node.js >= 20
- pnpm >= 9（推荐用 corepack 安装/启用）
- Docker（用于 postgres/redis）

如果本机没有 pnpm：

```bash
corepack enable
corepack prepare pnpm@9.15.5 --activate
```

## 本地启动

0) 复制环境变量（db:migrate/db:seed 依赖 DATABASE_URL）

```bash
cp .env.example .env
```

1) 启动依赖（Postgres + Redis）

```bash
docker compose up -d
```

2) 安装依赖并启动（API + 三个前端）

```bash
pnpm install
pnpm --filter @guiguan/api db:migrate
pnpm --filter @guiguan/api db:seed
pnpm -w dev
```

## 端口

- API: http://localhost:3001/health
- Student: http://localhost:3000
- Teacher: http://localhost:3002
- Admin: http://localhost:3003

## 认证（Step 3）

Seed 默认账号（`pnpm --filter @guiguan/api db:seed` 后可用）：

- admin@example.com / password123
- teacher@example.com / password123
- student@example.com / password123

接口：

- POST /auth/login（返回 `accessToken`，并写入 refresh cookie）
- POST /auth/refresh（使用 refresh cookie 刷新 `accessToken`）
- POST /auth/logout（清理 refresh cookie）
- GET /me（需 `Authorization: Bearer <accessToken>`）

## 验收命令

```bash
pnpm -w lint
pnpm -w typecheck
pnpm -w build
pnpm --filter @guiguan/api test
```
