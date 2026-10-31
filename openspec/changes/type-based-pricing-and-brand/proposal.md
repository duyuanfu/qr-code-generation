## Why

第一版付费墙只有「动态活码」和「静态导出」两个计费项，价格是全局单一值。实际运营中视频活码（30MB 起、带宽与存储成本最高）和文字活码（几乎零成本）卖同一个价，业务上说不通：卖视频亏，卖文字又拦住了转化。

同时联调暴露了几个真实缺陷：

1. **视频上传报「上传请求失败，请重试」** —— 用户完全看不到"文件太大"这个真实原因。根因是 Tomcat `max-swallow-size` 默认 2MB，超限时容器直接断连接，浏览器 `fetch` 抛网络错误而不是 HTTP 413。
2. **标题要手填** —— 用户传了一张 `2025年产品手册.pdf`，还得再打一遍标题。
3. **iOS 直出的 `.mov` 和录屏的 `.webm` 传不上去** —— 白名单只写死了 `.mp4`，但界面宣称支持视频。
4. **扫码落地页没有任何品牌标识** —— 码是客户印出去发出去的，扫码的人不知道这个服务是谁提供的。
5. **收款码只能配一张** —— 微信和支付宝只能二选一，客户想付哪个渠道都不行。

## What Changes

- **按二维码类型分别定价**：计费键升级为 `dynamic_qr.<contentType>`，未配置时回退到通用 `dynamic_qr`。八种内容类型各自独立的基础价。
- **体积阶梯加价**：每个计费项新增「含体积 / 超出步长 / 每步加价」三件套，`基础价 + ceil((总MB − 含MB) / 步长MB) × 加价`。体积以**服务端磁盘真实大小**为准，前端上报值不参与计价。
- **服务有效期**：计费项新增 `valid_months`（默认 3），生成时换算成 `dynamic_qrs.expires_at`，落地页到期后展示续费提示（不做硬断，避免客户已印出的码失效）。
- **双渠道收款码**：新建 `payment_qr_codes` 表，微信 / 支付宝各一条，支持启停与排序。
- **上传管道重构**：500MB 上限、三段式校验（元信息 → 文件头 64 字节 → 流式落盘二次卡限）、增量 SHA-256、`max-swallow-size: -1` 让超限能正常返回 413、扩充 `.mov/.m4v/.webm/.rar/.7z/.txt/.csv` 及其魔数。
- **标题自动取文件名**：上传后若标题为空或仍是上次自动填的值，用首个文件名回填（多文件时为「xxx 等 N 个文件」）；用户手改过就不再覆盖。
- **落地页品牌露出**：所有 `/q/[shortId]` 页面底部展示 `Evan 二维码 · http://qr.trythis.pw/`，全屏 PDF 阅读器用右下角浮动样式避免遮挡。
- **幂等迁移**：新增 `config/SchemaMigrator`，用 `information_schema` 查列后 `ALTER`，用 `app_migrations` 表抢占保证一次性数据迁移只跑一次。

## Capabilities

### New Capabilities
- `type-based-pricing`：按二维码类型 × 体积阶梯的服务端计价，含类型越权与体积越权双重校验。
- `service-validity`：服务有效期计算、落库与落地页到期提示。
- `multi-channel-payment-qr`：多渠道收款码的配置、排序与公开读取。
- `brand-attribution`：扫码落地页的品牌链接露出与样式变体。

### Modified Capabilities
- `file-security-compliance`：体积上限 100MB → 500MB；校验拆为元信息 / 文件头 / 流式三段；扩展名白名单扩充视频与压缩包格式；新增 `GlobalExceptionHandler` 把超限转成可读 413。
- `paywall-and-orders`：建单需带 `contentType`；`action_type` 落库存实际命中的细分键；订单金额改由服务端按真实体积计算。

## Impact

- **Affected Code**:
  - `backend/.../common/FileValidator.java`：拆分为 `validateMeta` / `validateHeader` / `validate`，扩白名单与魔数表。
  - `backend/.../controller/UploadController.java`：流式临时文件 + 增量 `MessageDigest`，64KB 缓冲，全程不 `getBytes()`。
  - `backend/.../common/GlobalExceptionHandler.java`（新建）：`MaxUploadSizeExceededException` → 413，同时给 `error` 与 `message`。
  - `backend/.../service/PricingService.java`（新建）：计费键推导、回退解析、体积计价、有效期。
  - `backend/.../common/MediaSizeResolver.java` + `MediaRef.java`（新建）：服务端核体积，挡路径穿越。
  - `backend/.../config/SchemaMigrator.java`（新建）：幂等加列 + `PRICING_V1` 种子迁移。
  - `backend/.../controller/{OrderController,DynamicQrController,AdminController,PaymentConfigController}.java`：按类型计价、双越权校验、`expires_at`、收款码 CRUD。
  - `backend/src/main/resources/{application.yml,schema.sql}`：500MB、`max-swallow-size: -1`、`payment_qr_codes` 表、10 行价目种子。
  - `frontend/src/lib/brand.ts` + `components/landing/BrandFooter.tsx`（新建）：品牌常量与两种页脚变体。
  - `frontend/src/components/workspace/ContentForm.tsx`：上传前置体检、错误内联展示、标题自动回填。
  - `frontend/src/components/workspace/PaymentModal.tsx`：按 `contentType` 取价、渠道切换、价格明细。
  - `frontend/src/components/admin/{PricingPanel,PaymentConfigPanel}.tsx`：按类型分组 + 双渠道收款码。
  - `frontend/src/app/page.tsx`：`mediaTitle` 初值置空、`pendingSaveContext` 贯穿下单与生成、`effectiveTitle` 绕开 setState 异步。
  - `frontend/src/app/q/[shortId]/page.tsx`：品牌页脚 + 到期提示。
- **Dependencies**：无新增依赖。
- **Config**：`UPLOAD_MAX_FILE_SIZE_MB`（默认 500）、`NEXT_PUBLIC_BRAND_URL`（默认 `http://qr.trythis.pw/`）。
- **部署注意**：`NEXT_PUBLIC_BRAND_URL` 是 build 期变量；Nginx `client_max_body_size` 必须 ≥ 520M，否则 413 由 Nginx 返回 HTML，前端解析不到 JSON。
