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

本文是按《Docker 多服务共享 MySQL 部署与接入通用指南》**第四节（既有服务无损平滑迁移）**写的落地版，
所有步骤都可以照抄执行。已有历史数据时**不要**直接删库重建 —— 走这里的流程，全程可回滚。

> 前提：宿主机上已经按指南第二节搭好 `/opt/shared-infra/mysql`，且 `shared-mysql` 正在运行。
> 检查：`docker ps --filter name=shared-mysql` 与 `docker network inspect shared-net`。

---

## 0. 先把新代码拉下来

```bash
cd /path/to/qr-code-generation
git pull            # 拿到改成 shared-net 的 docker-compose.yml 与新 .env 模板
```

此时**先不要** `docker compose up -d` —— 新的编排连的是新库，而新库还是空的。
老栈继续用旧编排跑着，接下来分两段做。

---

## 1~3. 导出 → 建库建账号 → 导入（线上无感）

一条命令跑完，等价于指南第四节步骤 1-3：

```bash
# 迁移那一次才需要旧库口令，临时给就行
OLD_ROOT_PASSWORD='旧容器的 root 口令' \
SHARED_ROOT_PASSWORD='shared-mysql 的 root 口令' \
./scripts/migrate-to-shared-mysql.sh prepare
```

脚本做的事：

1. `mysqldump --single-transaction --quick --no-tablespaces --set-gtid-purged=OFF`
   从旧容器导出到 `./backup/qr_studio_online_<时间>.sql`（一致性快照，不锁表、不影响线上）；
2. 在 `shared-mysql` 上建 `qr_studio` 库、建 `qr_studio_user@'%'` 账号并只授权本库；
3. 导入，然后**逐表精确 `COUNT(*)` 比对**新旧库。

> 为什么不用指南里的 `information_schema.table_rows`：那是 InnoDB 的估算值，
> 同一份数据前后查两次都可能不一样，拿它做迁移校验只会制造假警报。脚本用的是真 `COUNT(*)`。

prepare 阶段线上还在写，所以两边行数**允许**有差异（脚本会打印差异但不中止），
切流时会再比一次，那一次是严格的。

手工等价命令（不想用脚本时）：

```bash
docker exec -i qr-studio-mysql mysqldump -uroot -p'旧口令' \
  --default-character-set=utf8mb4 --single-transaction --quick \
  --no-tablespaces --set-gtid-purged=OFF qr_studio > backup/qr_studio_online.sql

docker exec -i shared-mysql mysql -uroot -p'共享口令' <<'SQL'
CREATE DATABASE IF NOT EXISTS qr_studio DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'qr_studio_user'@'%' IDENTIFIED BY '改成强口令';
GRANT ALL PRIVILEGES ON qr_studio.* TO 'qr_studio_user'@'%';
FLUSH PRIVILEGES;
SQL

docker exec -i shared-mysql mysql -uroot -p'共享口令' qr_studio < backup/qr_studio_online.sql
```

---

## 4. 切流（有几秒停写）

先把 `.env` 里的共享实例五项填好：

```ini
DB_HOST=shared-mysql
DB_PORT=3306
DB_NAME=qr_studio
DB_USER=qr_studio_user
DB_PASSWORD=强口令
```

然后：

```bash
OLD_ROOT_PASSWORD='旧口令' SHARED_ROOT_PASSWORD='共享口令' \
./scripts/migrate-to-shared-mysql.sh switch
```

`switch` 的实际动作，对应指南步骤 4：

1. `docker compose stop backend frontend` —— 停写，这是唯一的停机窗口；
2. **再导一次**并导入 —— 把 prepare 之后新产生的数据补过去（本项目量级是秒级）；
3. 严格比对行数，不一致直接中止，**不删任何东西**；
4. `docker compose up -d` —— 新编排把 backend 挂到 `shared-net`，连 `shared-mysql:3306`；
5. 冒烟：轮询 `http://127.0.0.1:${APP_PORT}/api/payment/config` 直到 200。

> 为什么比指南多做一次「补导」：指南的写法是先导、后切，中间隔的这段时间里的写入会丢。
> 本项目是付费业务（订单、活码），丢一条订单就是一次纠纷，所以切流前停写再导一遍。

---

## 5. 观察与清理

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
| 启动报 `Access denied ... to database` / `Unknown database` | 库还没建，或账号没授权 | 重跑 `prepare` 的建库建号段；账号必须 `GRANT ALL ON qr_studio.*` |
| 启动报 `CREATE DATABASE ... denied` | 生产配置里还挂着 `createDatabaseIfNotExist=true` | 该参数只在 `application-dev.yml` 里保留，生产 URL 不带它 |
| `Too many connections` | 多个业务共用 `max_connections=120` | 后端 Hikari 单实例 15，够用；别为了「快」把它调大 |
| 时间差 8 小时 | 容器时区或共享实例 `default-time-zone` 不一致 | 两边都应是 `Asia/Shanghai` / `+08:00` |

## 与本次改造相关的代码位置

| 文件 | 改了什么 |
|---|---|
| `docker-compose.yml` | 删掉 `mysql` 服务与 `mysql-data` 卷；backend 加 `networks: [default, shared-net]`；数据库参数改成 `DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD` |
| `backend/src/main/resources/application.yml` | JDBC 串按上面五个变量拼装；去掉 `createDatabaseIfNotExist`（共享实例上没有建库权限） |
| `backend/src/main/resources/application-dev.yml` | 本地开发的 URL（含 `createDatabaseIfNotExist`）只放在 dev profile |
| `.env.example` | `MYSQL_ROOT_PASSWORD` → `DB_*` 五项；旧容器变量仅在迁移期需要 |
| `scripts/migrate-to-shared-mysql.sh` | 上面四步的自动化：`prepare` / `switch` / `verify` / `rollback` |
