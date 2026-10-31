## 1. 数据层

- [x] 1.1 `pricing_configs` 新增 `included_size_mb` / `step_size_mb` / `step_price` / `valid_months` / `sort_order`
- [x] 1.2 `dynamic_qrs` 新增 `expires_at DATETIME NULL`
- [x] 1.3 新建 `payment_qr_codes`（`channel` / `channel_name` / `image_url` / `enabled` / `sort_order`）
- [x] 1.4 `schema.sql` 同步建表、加列，写入 10 行价目种子（2 / 4 / 6 / 6 / 8）与双渠道收款码种子
- [x] 1.5 `config/SchemaMigrator`（`@Order(1)` ApplicationRunner）：`information_schema` 查列后 `ALTER`，`app_migrations` + `INSERT IGNORE` 抢占保证一次性迁移只跑一次
- [x] 1.6 `PRICING_V1` 迁移：写入八个细分键 + 通用兜底行；顺带把提示文案刷新为含 3 个月有效期与合规免责

## 2. 计价服务

- [x] 2.1 `service/PricingService`：`keyFor` / `resolve`（细分 → 通用回退）/ `isPaywallActive` / `amountFor` / `validMonthsFor` / `matchesOrder`
- [x] 2.2 体积阶梯公式 `base + ceil((总MB − 含MB) / 步长MB) × 加价`；`含MB` 或 `步长MB` ≤ 0 时直接返回基础价
- [x] 2.3 `common/MediaRef` + `common/MediaSizeResolver`：`/uploads/**` 走 `File.length()`，挡路径穿越，单文件封顶 500MB；外链退回客户端 `size`
- [x] 2.4 `OrderController.create` 接收 `contentType` + `mediaUrls`，服务端算价；`dynamic_qr` 缺 `contentType` 直接 400
- [x] 2.5 订单 `action_type` 落**实际命中的细分键**（如 `dynamic_qr.video`）

## 3. 付费墙加固

- [x] 3.1 `DynamicQrController` 校验 `contentType` ∈ `url/text/vcard/wifi/image/video/pdf/file`
- [x] 3.2 类型越权：订单细分键与当前 `contentType` 不匹配 → 402
- [x] 3.3 体积越权：当前真实体积单价 > 订单金额 → 402 提示补差价
- [x] 3.4 空标题拒绝落库（400「请填写二维码标题」）
- [x] 3.5 生成时按 `valid_months` 写入 `expires_at`
- [x] 3.6 手工验证：2 元 url 订单解锁视频 / 4 元 image 订单塞 200MB，均 402

## 4. 上传管道

- [x] 4.1 `FileValidator` 拆为 `validateMeta` / `validateHeader` / `validate`（保留旧签名兼容单测）
- [x] 4.2 白名单扩充 `.m4v .mov .webm .rar .7z .pptx .txt .csv`
- [x] 4.3 魔数扩充：ISO BMFF `ftyp`、WebM EBML `1A45DFA3`、RAR `Rar!`、7z `377ABCAF`、zip 空包 `PK\x05\x06`、txt/csv 无 NUL
- [x] 4.4 `UploadController` 流式落盘 + 增量 SHA-256，64KB 缓冲，移除 `getBytes()`
- [x] 4.5 `application.yml`：`max-file-size: 500MB` / `max-request-size: 520MB` / `max-swallow-size: -1`
- [x] 4.6 `common/GlobalExceptionHandler`：`MaxUploadSizeExceededException` → 413，响应体同时含 `error` 与 `message`
- [x] 4.7 实测：200MB mp4 走 3001 代理 200 成功；510MB 返回 413 JSON 且不断连；webm/mov 通过；伪装 mp4 被魔数拦截

## 5. 管理后台

- [x] 5.1 `AdminController.listPricing` 按 `sortOrder` 排序；`UpdatePricingRequest` 增加 4 个新字段
- [x] 5.2 新增 `GET/POST /api/admin/payment-qr-codes`
- [x] 5.3 `PaymentConfigController` 返回 `{ payment, pricing, paymentQrs }`，收款码按 `sortOrder`
- [x] 5.4 `PricingPanel` 按「按类型 / 兜底 / 其他」三组渲染，每行含基础价、含体积、超出步长、加价、有效期、开关
- [x] 5.5 `PaymentConfigPanel` 双渠道卡片（微信绿 / 支付宝蓝）+ 独立提示语文案卡片

## 6. 前端体验

- [x] 6.1 `ContentForm` 上传前体检（空文件 / 超 500MB 前置拦截），错误内联展示，413 与网络中断给专属文案
- [x] 6.2 标题自动取文件名（多文件为「xxx 等 N 个文件」），`autoTitleRef` 记录上次自动值，用户手改后不再覆盖
- [x] 6.3 `page.tsx` `mediaTitle` 初值置空（原默认值会让自动回填永不触发）
- [x] 6.4 `handleSaveDynamic` 接 `titleOverride`，用 `effectiveTitle` 绕开 `setState` 异步
- [x] 6.5 `PaymentModal` 按 `contentType` 取价，展示基础价 / 含体积 / 本次体积 / 超出加收 / 有效期明细，支持渠道切换
- [x] 6.6 `lib/brand.ts` + `BrandFooter`（`inline` / `floating` 两种变体）
- [x] 6.7 `/q/[shortId]` 接入品牌页脚（PDF 用 floating）+ 到期琥珀色提示

## 7. 回归与文档

- [x] 7.1 `scripts/e2e-smoke.mjs` 断言改为「图片基础价 4.00」并带 `contentType` + `mediaUrls` —— 32 项全通过
- [x] 7.2 `scripts/e2e-admin.mjs` 改找 `dynamic_qr.image`，建单补 `contentType` —— 27 项全通过
- [x] 7.3 `scripts/e2e-upload-guard.mjs` —— 9 项全通过
- [x] 7.4 `mvn -q -o compile` / `npx tsc --noEmit` / `npm run build` 全通过
- [x] 7.5 更新 `AGENT.md`：价目表、计费键与双越权规则、上传三段式与 `max-swallow-size` 坑、数据模型 7 表、接口一览
- [x] 7.6 更新 `README.md`：定价表、品牌露出、500MB 上传、Nginx `client_max_body_size 520M`、新增环境变量
- [ ] 7.7 本变更归档到 `openspec/changes/archive/` 并沉淀到 `specs/`
