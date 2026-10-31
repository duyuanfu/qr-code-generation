#!/bin/sh
set -e

# 宿主机挂载卷的属主与容器内 UID 经常不一致，启动时统一放开上传目录写权限
mkdir -p /app/data/uploads
chmod -R 777 /app/data 2>/dev/null || true

exec java $JAVA_OPTS -jar /app/app.jar
