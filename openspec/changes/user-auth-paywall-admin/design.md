## Context

用户要求将系统后端架构全面升级为 **Java (Spring Boot 3 + MyBatis-Plus) + MySQL**，与前端 **Next.js 14 (React 18 + Tailwind CSS)** 实现前后端分离架构，代码仓库重构拆分为 `frontend/` 与 `backend/` 两个独立模块。

本地开发环境：
- JDK 17 (Microsoft OpenJDK 17.0.18)
- Maven 3.9.16
- MySQL 8（本地端口 3306，用户 `root`，数据库 `qr_studio`）
- Node.js 18+ / Next.js 14（前端端口 3001）

## Goals / Non-Goals

**Goals:**
- **项目结构重构**：根目录拆分为 `frontend/`（Next.js 客户端与扫码落地页）与 `backend/`（Spring Boot 3 + MyBatis-Plus 后端服务）。
- **Java 后端落地**：
  - 统一响应体 `Result`（`{success, code, message, data}`）、JWT 鉴权拦截器、ThreadLocal 用户上下文。
  - 六张业务表（用户、活码、扫码日志、订单、价格配置、收款配置）由 `schema.sql` 幂等初始化。
  - 上传管道内置扩展名黑白名单、敏感词库与 Magic Number 嗅探。
- **账号与权限**：邮箱注册/登录、`user`/`admin` 双角色、账号禁用拦截。
- **收费墙**：动态活码与高清导出两档计费，扫码支付 → 提交凭据 → 管理员审核 → 自动放行。
- **管理后台**：`/admin` 提供用户、价格、收款码、订单四个管理面板。

**Non-Goals:**
- 不接入真实支付网关（微信/支付宝商户号、支付回调），本期采用「收款码 + 人工核销 + 轮询」方案。
- 不做多租户白标、不做发票/退款体系。
- 静态二维码的四类内容（URL/文本/vCard/WiFi）保持纯前端算力，不落库、不计费。

## Decisions

### 1. 认证与密码安全架构
- **技术选择**：后端使用 **BCrypt**（`BCryptPasswordEncoder`，`password` 字段存单列哈希，不再单独存盐）做密码散列；使用 **JJWT 0.12 + HMAC-SHA256** 签发自包含 Token（载荷含 `userId` / `email` / `role`，默认 7 天有效）。Token 通过 `Authorization: Bearer` 头或 HttpOnly Cookie `token` 双通道传递，由 `AuthInterceptor` 统一解析并写入 `UserContext`（ThreadLocal，请求结束清理）。
- **理由**：密码散列与 JWT 由成熟库承担，避免手写加密逻辑；BCrypt 自带盐值与成本因子，跨平台无原生依赖问题。
- **初始管理员**：不再硬编码在 SQL 里，由 `QrStudioApplication` 的 `CommandLineRunner` 在「该邮箱不存在」时种子化，邮箱与初始口令通过 `ADMIN_EMAIL` / `ADMIN_PASSWORD` 环境变量注入；JWT 密钥同样走 `JWT_SECRET`。`application.yml` 中的值是**仅限本地开发**的回退值。

### 2. 数据持久化
- **技术选择**：**MySQL 8（utf8mb4）+ MyBatis-Plus 3.5**。表结构定义在 `backend/src/main/resources/schema.sql`，以 `spring.sql.init.mode=always` + `CREATE TABLE IF NOT EXISTS` + `INSERT IGNORE` 保证每次启动幂等执行。
- **表的划分**：
  - `users`: `id, email, password, role('admin'|'user'), status('active'|'disabled'), created_at, updated_at`
  - `dynamic_qrs`: `id, short_code(UNIQUE), user_id, content_type, title, description, media_urls(LONGTEXT), style_config(LONGTEXT), created_at, updated_at`
  - `scan_logs`: `id, qr_id, short_code, ip, user_agent, device, scanned_at`
  - `orders`: `id, order_no(UNIQUE), user_id, user_email, action_type, amount, status('pending'|'pending_review'|'paid'|'used'|'expired'), payment_voucher, created_at, paid_at`
  - `pricing_configs`: `id, item_key('dynamic_qr'|'static_export'), item_name, price, enabled`
  - `payment_configs`: `id, qr_image_url, qr_type('wechat'|'alipay'|'all'), notice_text, enabled`
- **JSON 字段**：`media_urls` 与 `style_config` 以 JSON **字符串**落库（`ObjectMapper` 序列化），读取端需二次 `JSON.parse`；前端 `lib/backend-api.ts` 的 `parseMediaList()` 兼容字符串与数组两种形态。
- **迁移结果**：旧的 `src/db/index.ts`（原子文件引擎）、`data/db.json` 与 `drizzle.config.ts` **已全部移除**，系统中不再存在任何文件型数据库路径。

### 3. 收费墙与二维码生成拦截交互
- **前端拦截时机**：屏幕实时预览完全免费；在用户点击「保存并生成动态活码」或「导出高清二维码 / 复制到剪贴板」时触发拦截。
- **流转细节**：
  1. 若未登录，弹出快速登录/注册对话框；
  2. 若已登录且为 `admin` 角色，直接放行，零费用立即完成；
  3. 若为普通 `user` 角色且该项功能价格 > 0，弹出 `PaymentModal`：
     - 展示管理员配置的收款码、应付金额与专属订单号；
     - 用户扫码后点击【我已完成支付】，订单变为 `pending_review`，弹窗进入轮询；
     - 管理员在 `/admin` 点击【确认到账】，订单标记为 `paid`；
     - 客户端轮询感知成功后，自动唤起最终的生成/下载流水线；
     - 开发环境可显式开启【测试一键模拟支付】免审放行。
- **服务端强制校验**（`DynamicQrController.createDynamicQr`，非 admin 且定价 > 0 时）：请求必须携带 `orderId`，且同时满足
  - `status = paid`，否则 **402**；
  - `actionType = dynamic_qr`（防止用 ¥2 的导出订单解锁 ¥9.9 的活码）；
  - `user_id` 归属当前登录账号（防止跨账号盗用订单）；
  - 生成成功后订单置为 `used`，实现**一次性核销**；`AdminController` 拒绝把 `used` 回滚为 `paid`。
- **订单接口归属校验**：`/api/order/status/{id}`、`/api/order/confirm`、`/api/order/mock-pay` 均经 `canAccess()` 判定，普通用户只能操作本人订单，管理员可越权。
- **模拟支付开关**：`app.paywall.mock-pay-enabled`，代码默认 `false`，仅本地 `application.yml` 显式打开；生产环境关闭后该接口直接返回 403。

### 4. 管理后台 (`/admin`) 架构
- **路由与权限守卫**：`frontend/src/app/admin/page.tsx` 为客户端页面，配合 `AuthContext` 做前端守卫（非管理员踢回首页并弹登录框）；真正的权限边界在 `AuthInterceptor`——所有 `/api/admin/**` 请求强制要求 `admin` 角色，否则 401/403。
- **子功能面板**（`components/admin/`，全部对接 `/api/admin/*`）：
  - **用户管理**：用户列表、角色变更、启用/禁用（管理员行禁用按钮置灰，后端同样拦截）。
  - **价格与计费**：配置活码与导出两档价格，支持 `enabled=0` 或价格 0 表示全员免费。
  - **收款码配置**：上传收款二维码（走 SHA-256 去重上传接口）、渠道、提示文案、付费墙总开关。
  - **订单流水**：按状态筛选、一键【确认到账】。

### 5. 上传文件安全合规检验管道
- **位置**：`backend/src/main/java/com/qrstudio/common/FileValidator.java`，由 `UploadController` 在写盘前调用。
- **校验管道流程**（顺序不可调换）：
  1. **体积阈值**：`app.upload.max-file-size-mb`（默认 100MB）。
  2. **扩展名黑名单**：拒绝 `.exe .bat .cmd .sh .bash .bin .php .jsp .asp .aspx .py .rb .js .vbs .ps1 .html .htm .svg`（`.svg` 因可内嵌脚本触发 XSS 一并拦截）。
  3. **扩展名白名单**：仅允许 `.png .jpg .jpeg .gif .webp .mp4 .pdf .docx .xlsx .zip`。
  4. **文件名敏感词**：涉政/涉赌/涉黄/违禁品类词库匹配拦截；活码标题与描述复用同一词库（`checkTextCompliance`）。
  5. **二进制文件头（Magic Number）嗅探**：PDF `%PDF`、PNG `\x89PNG`、JPEG `FF D8 FF`、GIF `GIF8`、WebP `RIFF…WEBP`、MP4 前 32 字节含 `ftyp`、docx/xlsx/zip `PK\x03\x04`。内容与后缀不符即拒绝，防止伪装上传。
- **落盘策略**：通过校验后按 **SHA-256 内容哈希**命名（`app.upload.dir`，默认 `data/uploads`），同哈希文件直接复用实现秒传去重；`WebConfig` 将 `/uploads/**` 映射到该目录并支持 Range 分片（视频拖动进度条）。

### 6. 前后端通信与路由
- 浏览器侧所有请求统一走 `next.config.mjs` 的 `rewrites`：`/api/:path*`、`/uploads/:path*` → `BACKEND_URL`（默认 `http://localhost:8080`）。
- **`frontend/src/app/api/` 目录必须不存在**。Next 的 `rewrites()` 属 afterFiles 阶段，排在文件系统路由之后；一旦残留 `route.ts`，会静默劫持本该转发给 Java 的请求，且响应结构与 Java 不一致（排查成本极高）。历史上的 `api/qr/dynamic`、`api/upload`、`api/system/network`、`app/uploads/[filename]` 均已删除。
- 扫码落地页 `/q/[shortId]` 是 Server Component，无法 fetch 相对路径，改用 `lib/backend-api.ts` 直连 `BACKEND_URL`，并透传真实客户端的 `user-agent` 与 `x-forwarded-for`，确保扫码日志记录的是访客而非 Next 服务器。
- **构建期约束**：`BACKEND_URL` 会被写入构建产物 `routes-manifest.json`，因此 Docker 场景必须作为 **build arg** 传入，运行时环境变量不生效。

### 7. 部署形态
- 服务级 Dockerfile：`frontend/Dockerfile`（三阶段 standalone）、`backend/Dockerfile`（maven → jre-alpine）。
- `docker-compose.yml` 编排 `mysql`（带 healthcheck）+ `backend`（等 mysql healthy）+ `frontend` 三服务；上传卷统一挂载 `./backend/data/uploads`，与本地开发路径保持一致，避免双路径丢文件。

## Risks / Trade-offs

- **[Risk] 无第三方商户自动回调，部分用户扫码后需等待人工确认**
  → **Mitigation**: 界面提供清晰的「我已付款」凭据提交与状态提示，开发/测试环境提供「一键模拟支付」（受开关控制），后台订单中心支持实时一键核验放行。
- **[Risk] 恶意用户修改前端 JS 跳过付费直接调用 API**
  → **Mitigation**: 服务端强校验闭环（`status=paid` + `actionType` 匹配 + 归属校验 + 一次性核销），前端拦截仅作体验优化。
- **[Risk] 订单被重复消费或跨账号复用**
  → **Mitigation**: 活码生成成功即置 `used`；`used` 不可回滚；订单所有读写接口做 `canAccess()` 归属判定。
- **[Risk] 模拟支付接口被线上滥用导致免单**
  → **Mitigation**: 代码默认 `mock-pay-enabled=false`，仅开发环境 yml 显式开启；Docker 部署通过 `.env` 显式声明。
- **[Risk] 前端误把接口写回 `app/api` 导致请求被 Next 劫持且无报错**
  → **Mitigation**: `AGENT.md` 列为红线；Code Review 时检查该目录是否为空。
- **[Risk] 迁移期数据双写/双读（旧 `db.json` 与新 MySQL 并存）**
  → **Mitigation**: 旧文件型存储代码已删除，落地页改为只读 Java 接口；迁移前遗留的 `frontend/data/` 原样保留（未删除），仅作备份，不被任何运行路径读取。
