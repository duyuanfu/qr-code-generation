# ---------- Stage 1: Maven 构建 ----------
FROM maven:3.9-eclipse-temurin-17 AS builder
WORKDIR /app

# 先只拷 pom，充分利用依赖层缓存
COPY pom.xml ./
RUN mvn -B -q dependency:go-offline

COPY src ./src
RUN mvn -B -q clean package -DskipTests

# ---------- Stage 2: 运行 ----------
FROM eclipse-temurin:17-jre-alpine
WORKDIR /app

# 说明：不执行 apk add，避免国内云服务器连接海外 Alpine 源超时
RUN mkdir -p /app/data/uploads

COPY --from=builder /app/target/*.jar /app/app.jar
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 8080

ENTRYPOINT ["/app/docker-entrypoint.sh"]
