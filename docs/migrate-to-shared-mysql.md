# 迁移到共享 MySQL（shared-mysql）

本项目原来在 `docker-compose.yml` 里自带一个 MySQL 容器（`qr-studio-mysql`）。
在同时跑多个服务的小规格云主机上，每个业务各养一个 MySQL 会把内存吃干，
所以改成接入宿主机上统一维护的公共实例 **`shared-mysql`**：

| | 改造前 | 改造后 |
|---|---|---|
| 数据库 | 自带容器 `qr-studio-mysql` + 命名卷 `mysql-data` | 公共实例 `shared-mysql`，库 `qr_studio` |
| 账号 | `root` | 专用账号 `qr_studio_user`（只有 `qr_studio.*` 权限） |
| 网络 | 项目默认网络 | 额外加入 `shared-net`（容器名即主机名） |
| 内存 | 单实例 InnoDB 缓冲池独占 | 与其他业务共享一个缓冲池（`256M` 起步） |

本文是《Docker 多服务共享 MySQL 部署与接入通用指南》**第四节（既有服务无损平滑迁移）**的落地版。
已有历史数据时**不要**删库重建，照着走一遍，一条命令搞定，全程可回滚。

> 前提：宿主机上已经按指南第二节搭好 `/opt/shared-infra/mysql`，且 `shared-mysql` 正在运行。
> 检查：`docker ps --filter name=shared-mysql` 与 `docker network inspect shared-net`。

---

## 1. 准备

```bash
cd /path/to/qr-code-generation
git pull                       # 拿到改成 shared-net 的 docker-compose.yml 与新配置模板
cp .env.example .env           # 若已有 .env，只补 DB_* 五项
```

`.env` 里跟这次迁移有关的部分：

```ini
DB_HOST=shared-mysql
DB_PORT=3306
DB_NAME=qr_studio
DB_USER=qr_studio_user
DB_PASSWORD=本库专用账号的强口令

# 仅迁移那一次需要
OLD_MYSQL_CONTAINER=qr-studio-mysql
MYSQL_ROOT_PASSWORD=旧容器的 root 口令
```

**库名和账号不用等谁分配**：指南第四节步骤 2 就是用共享实例的 root 现建，
脚本会按上面的 `DB_NAME` / `DB_USER` 建好并只授权本库。想换名字改这两行即可。

## 2. 一条命令迁移

```bash
SHARED_ROOT_PASSWORD='shared-mysql 的 root 口令' ./scripts/migrate-to-shared-mysql.sh
```

脚本按指南第四节的五步依次执行：

| 步骤 | 动作 | 说明 |
|---|---|---|
| 1 | `docker compose stop backend frontend` | 停写，**唯一停机窗口**，本项目量级是秒级 |
| 2 | `mysqldump --single-transaction --quick --no-tablespaces --set-gtid-purged=OFF` | 导到 `./backup/qr_studio_<时间>.sql` |
| 3 | `CREATE DATABASE` + `CREATE USER 'qr_studio_user'@'%'` + `GRANT ... ON qr_studio.*` | 在 `shared-mysql` 上建 |
| 4 | 导入，然后**逐表精确 `COUNT(*)` 比对** | 不一致直接中止，不删任何东西 |
| 5 | `docker compose up -d` + 轮询 `/api/payment/config` | 新编排连 `shared-mysql:3306`，起来即冒烟 |

> 为什么先停再导：指南是「先导、后切」，中间隔的那几秒里的写入会丢。本项目是付费业务
> （订单、活码），丢一条就是纠纷，所以把停写放在导出之前，只多花几秒。
>
> 为什么不用指南里的 `information_schema.table_rows`：那是 InnoDB 估算值，同一份数据
> 前后查两次都可能不同，拿它做校验只会误报。脚本用的是真 `COUNT(*)`。

不想用脚本时，四步手工等价命令：

```bash
docker compose stop backend frontend

docker exec -i qr-studio-mysql mysqldump -uroot -p'旧口令' \
  --default-character-set=utf8mb4 --single-transaction --quick \
  --no-tablespaces --set-gtid-purged=OFF qr_studio > backup/qr_studio.sql

docker exec -i shared-mysql mysql -uroot -p'共享口令' <<'SQL'
CREATE DATABASE IF NOT EXISTS qr_studio DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'qr_studio_user'@'%' IDENTIFIED BY '改成强口令';
GRANT ALL PRIVILEGES ON qr_studio.* TO 'qr_studio_user'@'%';
FLUSH PRIVILEGES;
SQL

docker exec -i shared-mysql mysql -uroot -p'共享口令' qr_studio < backup/qr_studio.sql
docker compose up -d
```

想复核行数：`./scripts/migrate-to-shared-mysql.sh verify`（旧容器还在跑时才有意义）。

## 3. 观察与清理

- 观察 **24~48 小时**：管理员能登录、活码落地页能打开、下单/核销正常、`/gif` 能出图；
- 确认无误后释放资源：

```bash
docker stop qr-studio-mysql          # 先停（数据卷还在，随时能起回来）
docker volume ls | grep mysql        # 找到旧卷名，通常是 qr-code-generation_mysql-data
docker volume rm <旧卷名>             # 确认无误再删
```

- `./backup/*.sql` 建议留到观察期结束（里面有用户邮箱与口令哈希，别提交到仓库）。

---

## 回滚

```bash
./scripts/migrate-to-shared-mysql.sh rollback    # 打印步骤，不执行
```

要点：旧容器和旧数据卷全程没动过，所以回滚只是「停新栈 → 编排退回旧版 → 起旧栈」，
1~2 分钟。**先停后端再退**，否则切流后写进共享库的数据在旧库里看不到。

---

## 排障

| 现象 | 原因 | 处理 |
|---|---|---|
| `UnknownHostException: shared-mysql` | backend 没加入 `shared-net`，或实例名拼错 | `docker network inspect shared-net`，确认 `shared-mysql` 与 `qr-studio-backend` 都在 `Containers` 里 |
| `Access denied for user 'qr_studio_user'@'172.x.x.x'` | 授权写成了 `'user'@'localhost'`，或口令不符 | 必须 `'user'@'%'`：容器间走网桥，来源 IP 是 `172.x`，不是环回 |
| 启动报 `Access denied ... to database` / `Unknown database` | 库还没建，或账号没授权 | 重跑脚本（建库建号是幂等的）；账号必须 `GRANT ALL ON qr_studio.*` |
| 启动报 `CREATE DATABASE ... denied` | 生产配置里还挂着 `createDatabaseIfNotExist=true` | 该参数只在 `application-dev.yml` 里保留，生产 URL 不带它 |
| `Too many connections` | 多个业务共用 `max_connections=120` | 后端 Hikari 单实例 15，够用；别为了「快」把它调大 |
| 时间差 8 小时 | 容器时区或共享实例 `default-time-zone` 不一致 | 两边都应是 `Asia/Shanghai` / `+08:00` |

## 与本次改造相关的代码位置

| 文件 | 改了什么 |
|---|---|
| `docker-compose.yml` | 删掉 `mysql` 服务与 `mysql-data` 卷；backend 加 `networks: [default, shared-net]`；数据库参数改成 `DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD` |
| `backend/src/main/resources/application.yml` | JDBC 串按上面五个变量拼装；去掉 `createDatabaseIfNotExist`（共享实例上专用账号没有建库权限） |
| `backend/src/main/resources/application-dev.yml` | 本地开发的 URL（含 `createDatabaseIfNotExist`）只放在 dev profile |
| `.env.example` | `MYSQL_ROOT_PASSWORD` → `DB_*` 五项；旧容器变量仅在迁移期需要 |
| `scripts/migrate-to-shared-mysql.sh` | 迁移自动化：默认一条命令走完五步，另有 `verify` / `rollback` |
