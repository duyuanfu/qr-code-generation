## 1. Repository Structure & Frontend Migration

- [x] 1.1 Restructure project directory into `frontend/` and `backend/`, moving Next.js application into `frontend/`
- [x] 1.2 Update `frontend/next.config.mjs` to configure API rewrites routing `/api/:path*` to Java backend `http://localhost:8080/api/:path*`
- [x] 1.3 Verify frontend build and dependencies inside `frontend/`

## 2. Java Spring Boot 3 Backend Scaffolding & MySQL DDL

- [x] 2.1 Initialize Maven Spring Boot 3.x project in `backend/` with Java 17, Spring Web, MyBatis-Plus, MySQL Connector, and JJWT dependencies
- [x] 2.2 Configure `backend/src/main/resources/application.yml` for MySQL (`localhost:3306`, root/root, db `qr_studio`) and file storage path
- [x] 2.3 Create `schema.sql` initializing tables (`users`, `dynamic_qrs`, `scan_logs`, `orders`, `pricing_configs`, `payment_configs`) with default admin (`ADMIN_EMAIL` / `ADMIN_PASSWORD`，口令不再写死) and pricing data

## 3. Java Backend Core Domain & Security Compliance

- [x] 3.1 Implement MyBatis-Plus entities, mappers, and services for all domain models
- [x] 3.2 Implement password encryption (BCrypt/PBKDF2), JWT token provider, and authentication interceptor for user/admin roles
- [x] 3.3 Implement file security validator (`FileValidator`) performing binary magic number sniffing, extension whitelist check, size limit, and sensitive word filtering
- [x] 3.4 Implement controllers: `AuthController`, `UploadController` (with SHA-256 deduplication and security inspection), and `DynamicQrController`

## 4. Paywall, Orders & Admin Backend APIs

- [x] 4.1 Implement `OrderController` and order service for creating orders, query status, submit payment confirmation, and mock-pay fast pass
- [x] 4.2 Implement `AdminController` for user management (list, toggle status, set role), pricing configuration, collection QR code maintenance, and order audit approval
- [x] 4.3 Implement `PaymentConfigController` for client payment modal retrieval

## 5. Frontend UI Integration & End-to-End Verification

- [x] 5.1 Implement Auth Modal component (`frontend/src/components/auth/AuthModal.tsx`) and header login status / admin navigation entry
- [x] 5.2 Implement Paywall Modal component (`frontend/src/components/workspace/PaymentModal.tsx`) with QR code display, status polling, and verification triggers
- [x] 5.3 Integrate paywall check into `DualPreview.tsx` (export pipeline) and dynamic QR generation with admin free bypass
- [x] 5.4 Build Admin Console view at `frontend/src/app/admin/page.tsx` with tabs for Users, Pricing, Payment QR Code, and Order Audit
- [x] 5.5 Verify full end-to-end integration: Java backend build/boot, MySQL table seeding, user registration/login, upload security block, scan payment review, admin approval, and free admin creation
  - 验证方式：本地 MySQL 8（localhost:3306）已就绪，后端 `mvn spring-boot:run` 启动成功并自动建表；新增 `scripts/e2e-smoke.mjs` 跑通全链路，**31 项断言全部通过**。
  - 覆盖范围：注册/登录/重复邮箱/弱密码、未登录访问管理接口 401、上传 `.exe` 拦截、伪装文件 Magic Number 拦截、SHA-256 命名与秒传去重、Range 206、无订单/未支付订单返回 402、建单金额取定价、提交凭据转 `pending_review`、管理员登录与审核转 `paid`、重复审核被拒、付费后生成活码、落地页取数、`mediaUrls` JSON 回读、订单核销为 `used` 且不可复用、跨用户查看/操作订单 403、普通用户访问管理接口 403、非法计费项拒绝、敏感词拦截。
  - 前端一侧：`/q/{shortCode}` SSR 正常渲染（数据来自 Java 而非本地 JSON）、rewrites 代理 `/api/**` 生效、`/admin` 可访问、不存在的短码返回 **404**、一次扫码访问只写 **1 条** `scan_logs`。
  - 回归脚本：`node scripts/e2e-smoke.mjs`（管理员口令通过 `ADMIN_PASSWORD` 环境变量传入，脚本内不含任何密钥）。

## 6. 迁移收尾修复（架构分裂与安全加固）

- [x] 6.1 删除 `frontend/src/app/api/{qr,upload,system}` 与 `frontend/src/app/uploads` 残留路由处理器
  - 原因：Next 的 `rewrites()` 属 afterFiles，排在文件系统路由之后，残留的 route handler 会截获请求，导致 `/api/qr/dynamic`、`/api/upload` 实际未转发到 Java
- [x] 6.2 移除已无引用的本地 JSON 存储（`frontend/src/db`、`drizzle.config.ts`），落地页改为调用 Java `GET /api/qr/dynamic/{shortCode}`
- [x] 6.3 落地页透传 `user-agent` / `x-forwarded-for`，保证 Java 端扫码埋点记录真实客户端信息
- [x] 6.4 订单安全加固：归属校验、`actionType` 匹配、一次性核销（`paid` → `used`）、审核禁止回退
- [x] 6.5 `/api/order/mock-pay` 增加 `app.paywall.mock-pay-enabled` 开关（默认 false）
- [x] 6.6 JWT 密钥、种子管理员账号密码改为环境变量注入（`JWT_SECRET` / `ADMIN_EMAIL` / `ADMIN_PASSWORD`）
- [x] 6.7 Docker：新增 `frontend/Dockerfile`、`backend/Dockerfile`，重写 `docker-compose.yml` 为 mysql + backend + frontend 三服务编排

## 7. 文档同步

- [x] 7.1 重写 `AGENT.md`：由「Next 单仓 + db.json」改为「frontend(Next) + backend(Spring Boot) + MySQL」双仓架构，补齐 API 清单、数据模型、上传管道、请求链路、红线与技术债
- [x] 7.2 重写 `design.md` 的 Decisions 1/2/5 与 Risks：Node `pbkdf2` → BCrypt + JJWT，`db.json`/drizzle → MySQL + MyBatis-Plus，上传管道位置改为 `backend/.../FileValidator.java`；新增「前后端通信与路由」「部署形态」两节
- [x] 7.3 修正 `proposal.md` 的 Impact 段与根 `README.md` 的技术栈/运行/部署说明
- [x] 7.4 迁移前遗留数据 `frontend/data/` 原样保留（未删除、未导入），补充 `frontend/data/README.md` 说明来源与迁移方式
- [x] 7.5 联调中发现的缺陷修复：落地页短码不存在改为返回 **404**（原为 200 + 提示页，会被搜索引擎收录）；`generateMetadata` 与页面重复取数导致**一次访问写两条扫码日志**，改用 React `cache()` 单请求去重；已核销订单复用时的报错文案由「尚未支付」改为「该订单已被使用」

## 8. 前端依赖瘦身

- [x] 8.1 移除已无引用的依赖：`drizzle-orm`、`drizzle-kit`、`nanoid`、`@aws-sdk/client-s3`、`@aws-sdk/s3-request-presigner`，并删除失效的 `db:push` 脚本
- [x] 8.2 `npm install` 重新生成 lock，根依赖由 22 个降至 17 个；清理 npm 卸载失败残留的 `node_modules/@aws*` 垃圾目录

## 9. 自测补强（管理端 / 安全 / 统一响应）

- [x] 9.1 新增 `scripts/e2e-admin.mjs`（27 项断言）：用户禁用与恢复、角色升降级、改价热更新、价格置 0 免费模式、收款提示文案更新与公开接口联动、导出定价 ¥2.00、模拟支付开关、局域网 IP 探测；所有配置变更在 `finally` 中恢复
- [x] 9.2 修复：`/api/system/network` 原返回裸 `{addresses}`，未走统一 `Result` 包装 → 后端改为 `Result.ok({addresses})`，前端 `page.tsx` 同步读取 `data.addresses`
- [x] 9.3 **修复越权漏洞**：JWT 无状态，账号被禁用后旧 token 在过期前依然有效（实测可继续建单）。`AuthInterceptor` 增加回查 `users` 表，校验 `status != disabled` 并采用**库中最新角色**，实现「禁用立即生效」「角色变更立即生效」；新增 `scripts/check-disabled-token.mjs` 做回归
- [x] 9.4 前端生产构建实测：`npm run start` 可正常起服务，`/` `/admin` `/q/{code}` 返回 200、未知短码 404、`/api/**` 代理链路正常

## 10. 上传防护与 CI

- [x] 10.1 **修复匿名上传**：`/api/upload` 原可匿名调用，任何人都能往服务器磁盘写 100MB 文件。`AuthInterceptor` 增加路径规则，未登录直接 401
- [x] 10.2 新增 `common/TokenBucketRateLimiter`（进程内令牌桶，零外部依赖，每 1024 次访问回收空闲桶）+ `common/UploadRateLimiter`（用户/IP 双维度）+ `config/UploadRateLimitInterceptor`
  - 阈值：用户 30 次/分钟、IP 60 次/分钟，可由 `app.upload.rate-limit.*` 配置；任一超限返回 **429** 并带 `Retry-After`
  - IP 取值优先级：`X-Forwarded-For` 第一段 → `X-Real-IP` → `remoteAddr`（经 Next rewrites 后 `remoteAddr` 恒为前端服务器）
  - 拦截器注册顺序必须在 `AuthInterceptor` 之后，用户维度的 key 依赖后者写入的 `UserContext`
- [x] 10.3 前端两处上传入口（`ContentForm`、`api-client.uploadSingleFile`）补 `Authorization` 头，并对 401 / 429 给出区分文案
- [x] 10.4 新增 `scripts/e2e-upload-guard.mjs`（6 项断言）：匿名 401、登录后放行、连打触发 429、`Retry-After` 存在、换账号+换 IP 立即恢复、新账号沿用耗尽 IP 仍被拒（证明按 key 分桶而非全局熔断）
- [x] 10.5 新增 `.github/workflows/ci.yml`：`backend`（打包并上传 jar 产物）→ `frontend`（`npm ci` + `tsc --noEmit` + `next build`）→ `e2e`（MySQL 8 service + 真实 jar + 三个联调脚本）；`docker` job 仅 `workflow_dispatch` 手动触发
  - CI 密钥全部为 `ci-*` 假值，通过 `env` 注入，不入仓库
- [x] 10.6 补首批单元测试（此前为零）：`TokenBucketRateLimiterTest`（5 项）、`AuthInterceptorTest`（9 项），`mvn test` 14/14 通过；CI 的 backend job 改为默认执行测试
- [x] 10.7 **修复 ThreadLocal 串号**（联调暴露）：`preHandle` 返回 `false` 时 Spring 不回调 `afterCompletion`，`UserContext` 身份残留在复用的 Tomcat 线程上，导致紧随其后的匿名请求被识别成上一个用户（实测表现为「未登录访问 `/api/admin/users`」偶发 403，最坏情况是管理员之后就位的匿名请求直接通过 admin 校验）。修复：`preHandle` 入口先 `UserContext.clear()`，并补回归用例 `doesNotLeakIdentityBetweenRequests`
- [x] 10.8 `e2e-smoke.mjs` 的上传用例补 token（上传改为强制登录后原用例会假阳性通过：401 也满足 `success === false`），并新增「匿名上传 401」独立断言

## 11. 付费墙有效性（预览隔离）

- [x] 11.1 修复「非登录状态可以直接截图使用」：`DualPreview` 未解锁时渲染 `previewValue` 演示码（URL → `/preview-demo`，vCard / WiFi 用结构相同的假数据），截图拿到的是一张废码；解锁后才切换为真实内容
- [x] 11.2 「进入排版打印页面」原为无鉴权 `window.print()`，等于一键输出高清可用码（比截图更直接），现纳入付费门禁
- [x] 11.3 导出 / 复制改为 `lib/qr-instance.ts` 的 `createQrInstance()` 离屏重绘，不再复用预览画布实例，避免把演示码导给已付费用户；`QRCodeCanvas` 与导出共用 `buildQrOptions()` 防止预览与成品样式漂移
- [x] 11.4 `paidValue` 与 `qrRawValue` 逐字比对，改动内容即重新计费；退出登录立即收回预览与导出权限
- [x] 11.5 批量生成原为完全免费（600px 成品 + ZIP 打包，无登录、无付费）：缩略图降为 240px 仅供核对映射关系，ZIP 下载加登录 + `static_export` 付费，付费后按 600px 重新渲染
- [ ] 11.6 已知残留：静态码内容由用户自行输入，可在 DevTools 中读取原值后用第三方工具生成，技术上无法封堵；根治方向是所有码统一走动态活码托管
