## Why

当前 QR Studio 平台所有二维码生成、多媒体上传与高清导出功能均为完全开放状态，缺少用户身份体系与商业变现闭环。随着平台使用量增加，亟需引入用户登录与收费墙机制，在用户导出或生成二维码前实现扫码付费；同时需要独立的 Admin 后台用于管理用户、动态配置功能价格与收款二维码（Admin 享有全功能免费特权）。此外，为防范恶意文件注入与违规内容传播，需要构建多层级的文件安全与合规检测体系，保障平台长期合规稳定运营。

## What Changes

- **用户认证与鉴权体系 (User Auth & Roles)**：提供用户注册、登录、登出与个人状态管理，支持常规用户 (User) 与系统管理员 (Admin) 角色划分，基于轻量 JWT / Cookie Session 实现无状态认证。
- **扫码付费墙与订单机制 (Paywall & Orders)**：在用户最终生成活码或导出高清二维码前弹出付费弹窗；普通用户需扫管理员配置的收款码并确认订单，Admin 账户直接免单放行；提供订单生命周期追踪与开发模式快捷核销能力。
- **管理后台 (Admin Console)**：专属管理界面，支持：
  - 用户管理：查看注册用户列表、启用/禁用账号、分配角色。
  - 价格管理：灵活配置不同二维码类型或全局单次生成/导出的收费金额。
  - 收款配置：上传与管理微信/支付宝收款二维码，设置收款提示文案与开关。
  - 订单审核：查看历史支付流水，支持手动确认或标记订单状态。
- **上传文件安全与合规检测 (Security & Compliance)**：
  - 双重文件安全校验：严格的后缀白名单 + 二进制文件头（Magic Number）嗅探，阻断可执行文件、恶意脚本与伪装恶意文件。
  - 文件大小与体积限制：限制恶意超大包上传，防范 DOS 攻击。
  - 内容敏感词/合规过滤层：拦截敏感违规文件名与文本内容，预留第三方云端内容安全审查（如腾讯云/阿里云内容安全）扩展接口。

## Capabilities

### New Capabilities
- `user-authentication`: 用户注册、登录、Session 会话管理、角色权限划分（User/Admin）及用户上下文状态提供。
- `paywall-and-orders`: 二维码生成/导出前的收费墙拦截逻辑、订单创建、展示管理员收款码、支付确认与管理端订单流水追踪。
- `admin-management`: 管理后台主控面板，包含用户管理、价格策略配置、管理员收款二维码维护与免密/免费特权控制。
- `file-security-compliance`: 多媒体上传安全防线，包括文件二进制头检测、脚本与恶意扩展名阻断、敏感词合规过滤及云端安全审查扩展接口。

### Modified Capabilities
<!-- 无现有全系统核心契约破坏性变更 -->

## Impact

- **Affected Code**（已按 Java 后端架构落地，与原始计划不同）:
  - `backend/src/main/resources/schema.sql`: 新增 `users`、`orders`、`pricing_configs`、`payment_configs` 表，并为价格与收款码写入种子数据。
  - `backend/src/main/java/com/qrstudio/controller/AuthController.java`: 注册、登录、当前用户、登出。
  - `backend/src/main/java/com/qrstudio/controller/AdminController.java`: 用户管理、价格设置、收款码配置、订单审核。
  - `backend/src/main/java/com/qrstudio/controller/OrderController.java`: 订单创建、状态查询、支付确认、模拟支付（带开关）。
  - `backend/src/main/java/com/qrstudio/common/FileValidator.java` + `UploadController.java`: 安全合规检测管道（Magic Number 校验与敏感词校验）。
  - `backend/src/main/java/com/qrstudio/config/AuthInterceptor.java`: JWT 解析与 `/api/admin/**` 强制鉴权。
  - `frontend/src/app/admin/page.tsx` + `frontend/src/components/admin/*`: 管理后台四个面板。
  - `frontend/src/components/workspace/PaymentModal.tsx` + `DualPreview.tsx`: 生成/导出前的付费拦截与轮询放行。
  - `frontend/src/lib/api-client.ts` / `backend-api.ts`: 前端统一请求封装与服务端直连后端。
- **Dependencies**: 后端使用 Spring Security Crypto 的 **BCrypt** 做密码散列，**JJWT** 签发 JWT；前端不引入任何加密/鉴权依赖。仓库拆分为 `frontend/` 与 `backend/` 两个独立模块，原先「纯 JS 文件持久化 + 零 C++ 原生依赖」的约束随之失效（改为 MySQL）。
