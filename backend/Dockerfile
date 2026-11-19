# ---------- Stage 1: Maven 构建 ----------
FROM maven:3.9-eclipse-temurin-17 AS builder
WORKDIR /app

# 先只拷 pom，充分利用依赖层缓存
COPY pom.xml ./
RUN mvn -B -q dependency:go-offline

COPY src ./src
RUN mvn -B -q clean package -DskipTests

# ---------- Stage 2: 运行 ----------
# 为什么不是 alpine：
#   1. AWT 在 musl 下缺 fontconfig，任何文字绘制都会抛
#      "Fontconfig head is null, check your fonts or fonts configuration"；
#   2. GIF 编码依赖 ffmpeg，Alpine 上要 apk add，而国内云服务器连海外 Alpine 源会超时。
# jammy（Ubuntu 22.04）一次解决 glibc / fontconfig / ffmpeg，代价是镜像多约 200MB。
FROM eclipse-temurin:17-jre-jammy
WORKDIR /app

# 国内构建时传 --build-arg APT_MIRROR=mirrors.aliyun.com 换源；
# 留空则用官方源（CI 在海外，官方源更快）。
ARG APT_MIRROR=
RUN if [ -n "$APT_MIRROR" ]; then \
      sed -i "s|archive.ubuntu.com|${APT_MIRROR}|g; s|security.ubuntu.com|${APT_MIRROR}|g; s|ports.ubuntu.com|${APT_MIRROR}|g" /etc/apt/sources.list; \
    fi \
 && apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg fontconfig \
 && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /app/data/uploads/gif

COPY --from=builder /app/target/*.jar /app/app.jar
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 8080

ENTRYPOINT ["/app/docker-entrypoint.sh"]
