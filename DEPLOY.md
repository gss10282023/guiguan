# 部署说明（Step 14）

> 目标：不上架也能稳定跑（日志/健康检查/限流/可回滚/可备份）。

## 1. 关键入口

- `GET /health`：进程存活检查（不依赖外部组件）
- `GET /ready`：依赖检查（DB/Redis 正常才返回 `{"status":"ok"}`）

## 2. 环境变量（核心）

API（`apps/api`）：

- `HOST`（默认 `0.0.0.0`）
- `PORT`（默认 `3001`）
- `LOG_LEVEL`（默认 `info`）
- `READY_CHECK_TIMEOUT_MS`（默认 `1000`）
- `DATABASE_URL`（PostgreSQL 连接串）
- `REDIS_URL`（Redis 连接串；不设置则 `GET /ready` 跳过 Redis 检查）
- `JWT_SECRET`（生产环境必须设置）
- `JWT_ACCESS_TTL_SECONDS`、`JWT_REFRESH_TTL_SECONDS`
- `AUTH_LOGIN_RATE_LIMIT_MAX`（默认 `10`）
- `AUTH_LOGIN_RATE_LIMIT_WINDOW_MS`（默认 `60000`）

Web（`apps/student|teacher|admin`）：

- `API_BASE_URL`（建议容器内使用 `http://api:3001`）

## 3. 生产（本地模拟）一键启动

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

验证：

```bash
curl http://localhost:3001/health
curl http://localhost:3001/ready
```

## 4. 迁移流程（推荐）

发布新版本的最小流程：

1) 拉取/构建新镜像（建议按 git sha 打 tag）
2) 先跑迁移：`prisma migrate deploy`
3) 再滚动重启 API/前端容器

如果你使用 `docker-compose.prod.yml`，API 容器默认启动时会执行：

```bash
pnpm --filter @guiguan/api db:migrate:deploy
```

> 生产更稳的做法是把迁移拆成单独的 job/一次性容器，避免 “每次重启都跑迁移”。

## 5. 备份策略（至少每日）

最小可用方案：每日 `pg_dump`，保留最近 N 天，备份文件落盘或同步到对象存储（S3/OSS）。

示例（把 `CONTAINER_NAME` 替换成你的 postgres 容器名）：

```bash
CONTAINER_NAME=guiguan-postgres-1
mkdir -p backups
docker exec -t $CONTAINER_NAME pg_dump -U postgres -d guiguan | gzip > backups/guiguan_$(date +%F).sql.gz
```

建议：

- 备份文件加密（尤其上云）
- 至少定期做一次恢复演练（验证备份可用）

## 6. 回滚策略（至少能回滚镜像）

镜像回滚：

- 以 `git sha` 或版本号给 `guiguan-api`/`guiguan-student`/`guiguan-teacher`/`guiguan-admin` 打 tag
- 回滚时把 compose 中的 `image:` 改回上一版本 tag，然后：

```bash
docker compose -f docker-compose.prod.yml up -d
```

数据回滚（更复杂）：

- Prisma 迁移推荐 “向前兼容/向前迁移”（避免依赖 down migration）
- 真正的数据回滚依赖 **备份恢复**（见上节）

## 7. 反向代理/HTTPS（可选）

`docker-compose.prod.yml` 内提供了一个可选的 Nginx（profile：`proxy`）：

```bash
docker compose -f docker-compose.prod.yml --profile proxy up -d
```

默认：

- `http://localhost:8080` → student
- `api.localhost` / `teacher.localhost` / `admin.localhost` 需要自己做 hosts 映射（或改为域名/子域名）

HTTPS 建议：

- 用 Caddy / Nginx 做 TLS 终止（Let’s Encrypt），并把 `JWT refresh cookie` 保持 `secure=true`。
