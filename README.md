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
- API Ready: http://localhost:3001/ready
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

# Step 10（Student PWA MVP）端到端验收
# 首次运行需要下载浏览器：
pnpm --filter @guiguan/student exec playwright install chromium
pnpm --filter @guiguan/student e2e

# Step 11（Teacher PWA MVP）端到端验收
pnpm --filter @guiguan/teacher exec playwright install chromium
pnpm --filter @guiguan/teacher e2e

# Step 12（Admin Web MVP）端到端验收
pnpm --filter @guiguan/admin exec playwright install chromium
pnpm --filter @guiguan/admin e2e
```

## 后台任务：课结束自动扣课时（Step 7）

```bash
# 跑一次（用于手工验收/调试）
pnpm --filter @guiguan/api job:complete-ended-sessions

# 常驻 worker（默认每 60s 扫描一次）
pnpm --filter @guiguan/api worker:dev
```

## 部署（Step 14）

本地模拟生产一键启动：

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

更多细节见 `DEPLOY.md`。
