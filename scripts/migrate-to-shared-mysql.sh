#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# 把本项目从「自带 MySQL 容器」迁移到宿主机上的共享实例 shared-mysql。
#
# 对应《Docker 多服务共享 MySQL 部署与接入通用指南》第四节（既有服务无损平滑迁移），
# 逐步命令见 docs/migrate-to-shared-mysql.md。
#
#   ./scripts/migrate-to-shared-mysql.sh prepare   步骤 1-3：导出 + 建库建号 + 导入 + 行数比对（线上无感）
#   ./scripts/migrate-to-shared-mysql.sh switch    步骤 4：停旧栈 → 补一次增量 → 起新栈 → 冒烟
#   ./scripts/migrate-to-shared-mysql.sh verify    随时复核新旧两库的行数（旧容器还在跑时才有意义）
#   ./scripts/migrate-to-shared-mysql.sh rollback  打印回滚步骤（只打印，不执行）
#
# 设计取舍：
#   - 所有命令都走 `docker exec -i`，宿主机不需要装 mysql 客户端；
#   - 导出用 --single-transaction（InnoDB 一致性快照，不锁表、不影响线上）；
#   - 行数比对用精确 COUNT(*)，不用 information_schema.table_rows（后者是估算值，
#     差一两个数量级都可能，用它做校验只会误报）；
#   - 唯一会「停服务」的只有 switch，且停写窗口 = 一次全量导出 + 导入（本项目量级是秒级）。
# ---------------------------------------------------------------------------
set -euo pipefail

cd "$(dirname "$0")/.."

info() { printf '\033[36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[33m[!] %s\033[0m\n' "$*"; }
die() { printf '\033[31m[x] %s\033[0m\n' "$*" >&2; exit 1; }

# ---------- 配置：全部来自 .env，可用同名环境变量覆盖 ----------
[[ -f .env ]] || die "找不到 .env：先 cp .env.example .env 并填好 DB_* 五项"
set -a
# shellcheck disable=SC1091
. ./.env
set +a

OLD_CONTAINER="${OLD_MYSQL_CONTAINER:-qr-studio-mysql}"
SHARED_CONTAINER="${SHARED_CONTAINER:-shared-mysql}"
DB_NAME="${DB_NAME:-qr_studio}"
DB_USER="${DB_USER:-qr_studio_user}"
# 旧库名可能与新库名不同（历史上叫过别的名字时用 OLD_DB_NAME 覆盖）
OLD_DB_NAME="${OLD_DB_NAME:-${MYSQL_DATABASE:-$DB_NAME}}"
OLD_ROOT_PASSWORD="${OLD_ROOT_PASSWORD:-${MYSQL_ROOT_PASSWORD:-}}"
SHARED_ROOT_PASSWORD="${SHARED_ROOT_PASSWORD:-}"
BACKUP_DIR="${BACKUP_DIR:-$PWD/backup}"
APP_PORT="${APP_PORT:-3001}"
STAMP="$(date +%Y%m%d_%H%M%S)"

need() {
  local name="$1"
  [[ -n "${!name:-}" ]] || die "缺少 $name：写进 .env，或本命令前置（例如 DB_PASSWORD=xxx $0 prepare）"
}

# 口令会拼进 SQL 语句，带引号/反斜杠会直接把语句弄坏，提前拦住
check_sql_literal() {
  local v="$1" name="$2"
  [[ "$v" != *"'"* && "$v" != *'\'* ]] || die "$name 不能包含单引号或反斜杠"
}

# ---------- 基础动作 ----------
running() {  # $1=容器名；返回容器是否在运行
  [[ "$(docker inspect -f '{{.State.Running}}' "$1" 2>/dev/null || true)" == "true" ]]
}

preflight() {
  command -v docker >/dev/null || die "本机没有 docker"

  running "$OLD_CONTAINER" \
    || die "旧容器 $OLD_CONTAINER 未运行。已经迁完并停掉旧容器的话，就不需要再跑 prepare/verify 了"
  running "$SHARED_CONTAINER" \
    || die "共享实例 $SHARED_CONTAINER 未运行：cd /opt/shared-infra/mysql && docker compose up -d"

  docker network inspect shared-net >/dev/null 2>&1 \
    || die "缺少 shared-net 网络：docker network create shared-net"

  need OLD_ROOT_PASSWORD
  need SHARED_ROOT_PASSWORD
}

dump_old() {
  local out="$1"
  mkdir -p "$(dirname "$out")"
  info "导出 $OLD_CONTAINER/$OLD_DB_NAME → $out"
  docker exec -i "$OLD_CONTAINER" mysqldump \
    -uroot -p"$OLD_ROOT_PASSWORD" \
    --default-character-set=utf8mb4 \
    --single-transaction \
    --quick \
    --no-tablespaces \
    --set-gtid-purged=OFF \
    --routines --triggers \
    "$OLD_DB_NAME" >"$out"

  local bytes
  bytes=$(wc -c <"$out" | tr -d ' ')
  ((bytes > 1024)) || die "导出文件只有 ${bytes}B，明显不对，别往下走"
  info "导出完成：$(du -h "$out" | cut -f1)（${bytes} 字节）"
}

create_schema_and_user() {
  info "在 $SHARED_CONTAINER 上建库 $DB_NAME 与专用账号 $DB_USER"
  docker exec -i "$SHARED_CONTAINER" mysql -uroot -p"$SHARED_ROOT_PASSWORD" --default-character-set=utf8mb4 <<SQL
CREATE DATABASE IF NOT EXISTS \`$DB_NAME\`
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$DB_USER'@'%' IDENTIFIED BY '$DB_PASSWORD';
ALTER USER '$DB_USER'@'%' IDENTIFIED BY '$DB_PASSWORD';
GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'%';
FLUSH PRIVILEGES;
SQL
}

import_shared() {
  local file="$1"
  info "导入 $file → $SHARED_CONTAINER/$DB_NAME"
  docker exec -i "$SHARED_CONTAINER" mysql \
    -uroot -p"$SHARED_ROOT_PASSWORD" \
    --default-character-set=utf8mb4 \
    "$DB_NAME" <"$file"
}

# 精确行数：先列出表名，再拼一条 UNION ALL 的 COUNT(*) 查询
table_counts() {
  local container="$1" rootpwd="$2" dbname="$3"
  local tables sql="" t
  tables=$(docker exec -i "$container" mysql -uroot -p"$rootpwd" -N -B -e \
    "SELECT table_name FROM information_schema.tables
      WHERE table_schema='$dbname' AND table_type='BASE TABLE' ORDER BY table_name")

  while IFS= read -r t; do
    [[ -z "$t" ]] && continue
    [[ -n "$sql" ]] && sql+=" UNION ALL "
    sql+="SELECT '$t' AS t, COUNT(*) AS c FROM \`$t\`"
  done <<<"$tables"

  [[ -n "$sql" ]] || {
    echo "(空库)"
    return 0
  }
  docker exec -i "$container" mysql -uroot -p"$rootpwd" -N -B -e "$sql" "$dbname" | sort
}

compare_counts() {
  local strict="$1"
  local old new
  old=$(table_counts "$OLD_CONTAINER" "$OLD_ROOT_PASSWORD" "$OLD_DB_NAME")
  new=$(table_counts "$SHARED_CONTAINER" "$SHARED_ROOT_PASSWORD" "$DB_NAME")

  if [[ "$old" == "$new" ]]; then
    info "行数一致："
    printf '%s\n' "$old" | sed 's/^/    /'
    return 0
  fi

  warn "行数不一致（左=旧库 $OLD_DB_NAME，右=新库 $DB_NAME）："
  diff -u <(printf '%s\n' "$old") <(printf '%s\n' "$new") | sed 's/^/    /' || true

  if [[ "$strict" == "strict" ]]; then
    die "切流后校验失败：新库数据与旧库不符，先别删任何东西，按 rollback 处理"
  fi
  warn "线上仍有写入，这个差异通常只是导出之后的新数据；switch 阶段停写后会再比一次"
}

require_new_compose() {
  grep -q 'shared-net' docker-compose.yml \
    || die "docker-compose.yml 还是旧版（没有 shared-net）。先 git pull 拿到本次改造的编排文件"
  need DB_USER
  need DB_PASSWORD
  need JWT_SECRET
  need ADMIN_PASSWORD
  check_sql_literal "$DB_PASSWORD" DB_PASSWORD
}

smoke() {
  info "等待新栈就绪：http://127.0.0.1:${APP_PORT}/api/payment/config"
  local i
  for i in $(seq 1 60); do
    if curl -fsS "http://127.0.0.1:${APP_PORT}/api/payment/config" >/dev/null 2>&1; then
      info "新栈已就绪（第 ${i} 次探测）"
      return 0
    fi
    sleep 2
  done
  docker compose logs --tail=60 backend || true
  die "120 秒内没起来：先看上面的 backend 日志；大概率是 DB_HOST/DB_USER/DB_PASSWORD 或 shared-net 没挂上"
}

# ---------- 子命令 ----------
cmd_prepare() {
  preflight
  need DB_PASSWORD
  check_sql_literal "$DB_PASSWORD" DB_PASSWORD

  local dump="$BACKUP_DIR/${DB_NAME}_online_${STAMP}.sql"
  dump_old "$dump"
  create_schema_and_user
  import_shared "$dump"
  compare_counts lenient

  echo
  info "步骤 1-3 完成（线上未受影响）"
  echo "  备份文件：$dump"
  echo "  下一步（会有几秒停写）：./scripts/migrate-to-shared-mysql.sh switch"
}

cmd_switch() {
  require_new_compose
  preflight
  command -v curl >/dev/null || die "本机没有 curl，冒烟步骤没法跑"

  info "停写：docker compose stop backend frontend"
  docker compose stop backend frontend || warn "stop 没成功（可能已经停了），继续"

  local dump="$BACKUP_DIR/${DB_NAME}_switch_${STAMP}.sql"
  dump_old "$dump"
  create_schema_and_user
  import_shared "$dump"
  compare_counts strict

  info "切换到共享实例：docker compose up -d"
  docker compose up -d
  smoke

  echo
  info "切流完成，数据在新库上跑着"
  cat <<EOF
  旧容器仍在运行（保留回滚能力），新写入已全部落在 $SHARED_CONTAINER。
  观察 24~48 小时、确认业务与数据都对，再释放内存和磁盘：
      docker stop $OLD_CONTAINER          # 先停，数据卷还在，随时能起回来
      docker volume ls | grep mysql       # 确认旧卷名
      docker volume rm <旧卷名>            # 确认无误后再删，删了就没退路
  迁移期间的两份备份在 $BACKUP_DIR/，建议留到观察期结束。
EOF
}

cmd_verify() {
  preflight
  compare_counts lenient
}

cmd_rollback() {
  cat <<EOF
回滚（旧容器与旧数据卷都还在，全过程 1~2 分钟）：

  1) 停新栈，避免继续往共享库写：
       docker compose stop backend frontend

  2) 把编排与 .env 退回旧版（旧版自带 mysql 服务、连的是 $OLD_CONTAINER）：
       git log --oneline -- docker-compose.yml     # 找到改造前那个提交
       git checkout <改造前的提交> -- docker-compose.yml
       # .env 里 DB_* 五项留着不碍事，但要保证 MYSQL_ROOT_PASSWORD 已填

  3) 起回来（旧数据卷没动过，起来就是切流前的状态）：
       docker compose up -d

  4) 仅在旧库也写坏了时，才需要把备份倒回旧库：
       docker exec -i $OLD_CONTAINER mysql -uroot -p'***' $OLD_DB_NAME < $BACKUP_DIR/<备份>.sql

注意：切流之后新库上的写入不会自动回灌。真要回滚，第一步先停后端，
否则这段窗口里的订单与活码会丢在共享库里（数据还在，但旧栈看不到）。
EOF
}

case "${1:-}" in
prepare) cmd_prepare ;;
switch) cmd_switch ;;
verify) cmd_verify ;;
rollback) cmd_rollback ;;
*)
  sed -n '8,11p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
  ;;
esac
