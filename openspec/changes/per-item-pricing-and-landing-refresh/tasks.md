## 1. 计价内核

- [x] 1.1 `pricing_configs` 新增 `per_item TINYINT NOT NULL DEFAULT 0`
- [x] 1.2 `PricingConfig` 实体加 `perItem`
- [x] 1.3 `PricingService.amountForItems(actionType, contentType, List<Long> itemSizes)` 作为唯一计价入口
- [x] 1.4 `per_item=1` 时逐件累加，`per_item=0` 时按合计体积算一份
- [x] 1.5 `MediaSizeResolver.sizes()` 返回逐文件字节数，`totalBytes()` 改为求和
- [x] 1.6 `OrderController.create` 改用逐文件数组下单
- [x] 1.7 `DynamicQrController` 核销用同一数组算 `required`，件数或体积不足返回 402
- [x] 1.8 实测：3 张图片 ¥12、单个 PDF ¥6、2 个文件 ¥12

## 2. 内容与类型自洽

- [x] 2.1 `DynamicQrController.mediaTypeMismatch()`：pdf / video / image 各自白名单，file 放行任意
- [x] 2.2 校验排在付费墙之前（返回 400 而非 402）
- [x] 2.3 实测：`pdf + .png` → 400

## 3. 迁移

- [x] 3.1 `SchemaMigrator` 新增 `2026-10-per-item-pricing-v2`
- [x] 3.2 四个附件类型 `per_item = 1`，纯文本类 `per_item = 0`
- [x] 3.3 删除 `dynamic_qr.wifi` 价目行
- [x] 3.4 `static_export.valid_months = 0`
- [x] 3.5 对齐所有 `item_name` 与支付提示语
- [x] 3.6 `schema.sql` 种子 INSERT 只写稳定列（不引用 `per_item` / `valid_months`），并加警告注释
- [x] 3.7 修复：种子引用未存在的列导致老库启动失败

## 4. 删除 WiFi 类型

- [x] 4.1 `ContentTypeSelector` 去掉 wifi，栅格 8 → 7
- [x] 4.2 `ContentForm` 删除 WiFi 表单与相关 props
- [x] 4.3 `types/qr.ts` 移除 `WiFiData` 与联合类型成员
- [x] 4.4 `qr-formatters.ts` 移除 `buildWiFiString`
- [x] 4.5 后端 `ALLOWED_CONTENT_TYPES` 移除 `wifi`
- [x] 4.6 `SchemaMigrator` v1 种子不再包含 wifi 行（v2 的 DELETE 保留，用于清理老库）

## 5. 文件类型与上传

- [x] 5.1 `FileValidator` 白名单扩充到 PPT / ODT / RTF / MD / TXT / 音频 / 压缩包等
- [x] 5.2 魔数表同步补齐（OLE2 / fLaC / OggS / ADTS / EBML / MPEG-PS / RIFF-WAVE / gzip / BMP / RTF）
- [x] 5.3 `ContentForm` 按类型给 `accept`，视频与 PDF 限制 1 个
- [x] 5.4 上传提示带价格与数量限制

## 6. 扫码落地页

- [x] 6.1 新增 `LandingHeader`（logo + 站名回首页 + 进入首页，light/dark 两态）
- [x] 6.2 `q/[shortId]/page.tsx` 改为「类型定版式 + 文件守卫」四分支
- [x] 6.3 `MobileFileList`：资源管理器式一行一个，语义化图标 + `EXT · 体积` + 下载钮，带空状态
- [x] 6.4 `MobileImageViewer`：多图纵向连排零间距、逐张下载、微信原生预览
- [x] 6.5 `MobileVideoPlayer`：满宽黑底、X5 属性、右上角下载胶囊
- [x] 6.6 删除不再使用的 `BrandFooter`
- [x] 6.7 PDF 分支只在 `contentType === 'pdf'` 时启用，`file` 类型永远走文件列表

## 7. 前端支付与后台

- [x] 7.1 `PaymentModal` 按件展示（`3 张` = 3 × 基础价），标题带件数
- [x] 7.2 `validMonths = 0` 时显示「永久有效（内容不存服务器）」
- [x] 7.3 `PricingPanel` 支持勾选「按件累加」并保存 `perItem`
- [x] 7.4 `types/admin.ts` 同步标签（删 wifi、`file` → 文件下载、`static_export` → 二维码图片导出）
- [x] 7.5 `exportUnlocked`：动态活码已付费即解锁导出，不再二次弹窗

## 8. 验证与文档

- [x] 8.1 `mvn -o compile` 通过
- [x] 8.2 `npx tsc --noEmit` 通过
- [x] 8.3 `npm run build` 通过
- [x] 8.4 迁移生效核对：wifi 消失、`perItem=1`、`validMonths=0`、文案更新
- [x] 8.5 更新 `AGENT.md`（价目表、按件计价、落地页版式、schema.sql 警告）
- [x] 8.6 更新 `README.md`（定价表、特性、落地页说明）
- [x] 8.7 `e2e-smoke.mjs` 17 通过（管理员链路因未提供 `ADMIN_PASSWORD` 跳过）、`e2e-upload-guard.mjs` 9 通过 0 失败
- [x] 8.8 本地实测四种版式：图片页 3 图 + 3 个下载按钮、视频页 `<video>` + 下载、文件页 `清单.txt TXT` / `说明.md MD`、PDF 页仅品牌栏 + canvas
- [ ] 8.9 真机（微信 / iOS / 安卓）扫码复验
