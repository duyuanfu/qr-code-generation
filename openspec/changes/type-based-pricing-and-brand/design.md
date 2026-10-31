## Context

付费墙 v1 的技术形态是「两个计费项 + 全局单值价格」。上线后发现三个结构性问题：

1. **计费键粒度不足**：`orders.action_type` 只存 `dynamic_qr`，审核时看不出这单买的是 2 元的文字还是 8 元的视频，也无法阻止"用 2 元订单解锁视频活码"。
2. **价格与内容成本脱钩**：视频 30MB 起、图片几百 KB，成本差一个数量级，却同价。
3. **体积不可信**：客户端上报的 `size` 字段是纯前端值，DevTools 改一下就白嫖。

同时上传管道存在一个隐蔽的可用性缺陷（见下 §D2），必须和定价改造一起修，否则大文件视频永远传不上去，8 元档也卖不动。

## Goals / Non-Goals

**Goals**
- 计费键能精确表达「哪种内容类型」，且保留通用兜底不破坏老数据。
- 价格公式可配置，不写死在代码里；admin 改完立即对新订单生效。
- 体积以服务端为准，前端改不动。
- 订单与内容类型强绑定，跨类型不能复用。
- 服务有效期可配置，落库成绝对时间。
- 上传 500MB 视频不 OOM、超限能返回可读错误。

**Non-Goals**
- 不做按扫码次数计费（现有 `scan_logs` 只用于统计，未纳入计费）。
- 不做自动续费 / 支付网关回调 —— 仍是「扫码 + 人工核销」。
- 不做到期硬断。已印出去的二维码突然失效会造成客户投诉，只提示不拦截。
- 不做 CDN / 对象存储迁移，仍是本地磁盘 + `/uploads/**`。

## Decisions

### D1. 计费键用 `dynamic_qr.<contentType>`，配回退链

```java
public static String keyFor(String actionType, String contentType) {
    if (contentType == null || contentType.isBlank()) return actionType;
    return actionType + "." + contentType;   // dynamic_qr + video -> dynamic_qr.video
}

public PricingConfig resolve(String actionType, String contentType) {
    PricingConfig exact = findByKey(keyFor(actionType, contentType));
    return exact != null ? exact : findByKey(actionType);   // 回退通用行
}
```

**为什么不用枚举/常量表**：价格必须在 admin 后台可改。键是字符串，新增内容类型时只需在 `pricing_configs` 插一行，代码零改动（`ALLOWED_CONTENT_TYPES` 除外，那是安全边界）。

**为什么保留 `dynamic_qr` 通用行**：库里历史订单的 `action_type` 都是 `dynamic_qr`；老库升级后如果删掉通用行，所有老订单会解析不到价格。兜底行让迁移无感。

### D2. `max-swallow-size: -1` 是 413 能被前端看到的前提

这是本次排查最反直觉的一处。现象是"传大视频报『上传请求失败，请重试』"，前端拿不到任何 HTTP 状态码。

链路：请求体超过 `spring.servlet.multipart.max-file-size` → Tomcat 判定超限 → 默认 `max-swallow-size` 仅 2MB，容器"吞掉"2MB 剩余请求体后**直接关闭连接** → 浏览器正在发送的剩余字节被 RST → `fetch` 抛 `TypeError: Failed to fetch`（网络层错误），**不是** 413 响应。

所以三个改动缺一不可：

| 改动 | 作用 |
|---|---|
| `server.tomcat.max-swallow-size: -1` | 让容器把剩余请求体读完，连接不提前断，才能正常写回响应 |
| `GlobalExceptionHandler` 捕获 `MaxUploadSizeExceededException` | 把容器异常翻译成 413 + 可读中文 |
| 前端区分 `res.status === 413` | 展示"文件超过 500MB"而不是通用失败文案 |

响应体里 `error` 和 `message` **两个都给**：上传接口失败是裸结构（前端 `ContentForm` 读 `error`），而限流等异常走 `Result` 封装（读 `message`）。少给一个就有一边空白。

### D3. 三段式校验 + 流式落盘

原实现 `file.getBytes()` 全量入堆，500MB 视频直接把 JVM 打爆。改造后：

```
validateMeta(filename, size)          // 常量开销，读字节之前就挡掉大部分坏请求
  ↓
读前 64 字节 → validateHeader()        // 魔数嗅探
  ↓
streamToTemp(剩余流, 64KB 缓冲)        // 同时增量 MessageDigest；累计超上限立刻抛
  ↓
Files.move(temp → uploads/<sha256><ext>)  // 已存在则删 temp（秒传去重）
```

内存占用恒定 64KB，与文件大小无关。

**魔数表为什么长这样**：
- `mp4/m4v/mov` 同属 ISO BMFF，都在前 64 字节内找 `ftyp` box —— 三个扩展名共用一套嗅探，只改后缀不改内容也拦不住（本来也不该拦，它们真是同一容器）。
- `webm` 是 Matroska/EBML，头 4 字节 `1A 45 DF A3`，与 ftyp 完全不同，必须单独认。
- `txt/csv` 没有魔数，用"前 64 字节无 NUL"作为弱校验（二进制文件几乎必然含 `\x00`）。

### D4. 体积以服务端为准

```java
// MediaSizeResolver
if (url.startsWith("/uploads/")) {
    if (name.contains("/") || name.contains("\\") || name.contains("..")) continue; // 挡穿越
    File f = new File(uploadDir, name);
    if (f.isFile()) total += Math.min(f.length(), MAX_SINGLE_BYTES);
} else {
    total += media.getSize();   // 外链只能信客户端
}
```

`/uploads/<sha256>.<ext>` 是本服务自己写出去的文件，`File.length()` 就是真实体积，客户端改 `size` 字段无效。外链没有本地文件可 stat，只能退回客户端值 —— 这是已知残留风险，但外链本身对存储成本无影响，风险可接受。

路径穿越校验不能省：`/uploads/../../etc/passwd` 会让 `new File(uploadDir, name)` 逃出上传目录。

### D5. 双越权校验放在 `DynamicQrController`，不在 `OrderController`

建单时校验不够，因为**建单和生成是两次请求**，中间可以换 `contentType` / 换文件。必须在真正生成时再核一遍：

```java
// 1) 类型越权
if (!pricingService.matchesOrder(paidOrder.getActionType(), expectedKey, ACTION_DYNAMIC))
    return Result.error(402, "订单对应的二维码类型不匹配，请重新下单");

// 2) 体积越权
BigDecimal required = pricingService.amountFor(ACTION_DYNAMIC, contentType, actualBytes);
if (paidOrder.getAmount() != null && paidOrder.getAmount().compareTo(required) < 0)
    return Result.error(402, "本次文件体积超出该订单包含的额度，请重新下单补足差价");
```

`matchesOrder` 允许通用行订单（`action_type = "dynamic_qr"`）通过，因为老数据和兜底行的订单没有细分键。

### D6. 幂等迁移而非改 schema.sql 后祈祷

MySQL 8 **没有** `ADD COLUMN IF NOT EXISTS`（那是 PostgreSQL 语法）。老库不会因为 `schema.sql` 改了列就自动加上新列，`CREATE TABLE IF NOT EXISTS` 对已存在的表直接跳过。

```java
ensureColumn("pricing_configs", "included_size_mb", "INT NOT NULL DEFAULT 0");
// -> SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND ...
// -> 为 0 才 ALTER TABLE ... ADD COLUMN
```

一次性数据迁移用 `app_migrations(id PK, applied_at)` + `INSERT IGNORE` 抢占：

```java
if (markApplied("2026-10-pricing-tiers-v1")) {   // INSERT IGNORE 影响行数=1 才算抢到
    applyPricingTiers();
    refreshPaymentNotice();
}
```

`INSERT IGNORE` 的影响行数是抢占判据 —— 多实例同时启动时只有一个能拿到 1，其余拿到 0。没有它，多副本部署会把价目改两遍（虽然幂等，但 `sort_order` 会漂）。

### D7. 到期只提示不拦截

`expires_at` 只用于落地页展示琥珀色提示条，**不参与访问控制**。

理由：二维码一旦印在包装、海报、名片上就无法召回。到期就 403 会让客户在完全不知情的情况下"码突然坏了"，比"多给几天服务"的损失大得多。商业上的正确做法是提示 + 人工催续费。

### D8. 标题自动回填用 ref 记录上次自动值

```tsx
const autoTitleRef = useRef('');
const current = mediaTitle.trim();
if (current === '' || current === autoTitleRef.current) {
    autoTitleRef.current = suggested;
    onMediaTitleChange(suggested);
}
```

判据是"空 **或** 仍是上次自动填的值"。用户手改过之后 `current !== autoTitleRef.current`，后续再传文件就不覆盖 —— 否则用户改好的标题会被第二个文件冲掉。

同时 `page.tsx` 里 `mediaTitle` 初值必须是空串。原先有一个默认值 `2025年产品手册与演示资源`，导致自动回填永远不触发（`current !== ''`）。这个默认值看着友好，实际是"永远不生效"的元凶。

## Risks / Trade-offs

| 风险 | 缓解 |
|---|---|
| 500MB 上限可能被打满磁盘 | 上传限流（用户 30/min + IP 60/min）+ SHA-256 去重；生产需加磁盘监控 |
| 外链体积信任客户端 | 外链不占本服务存储与带宽，影响有限；且需登录才能建单 |
| 价目改价不追溯历史订单 | 订单落库存当时金额，`DynamicQrController` 比对也用订单金额，历史订单不受影响 |
| 到期不硬断 → 有人白用 | 商业决策，接受；后续可加"到期 30 天后软删内容" |
| `valid_months` 改了不影响已生成的码 | `expires_at` 是生成时算死的绝对时间，符合预期；想延长需单独续费接口 |
| 细分键增多后 admin 面板变长 | `PricingPanel` 按「按类型 / 兜底 / 其他」三组折叠渲染 |

## Migration Plan

1. 部署新 jar（`SchemaMigrator` 自动加列 + 跑 `PRICING_V1` 种子）。
2. 老库中 `pricing_configs` 的 `dynamic_qr` 行保留为兜底；新增 8 行细分键覆盖八种 `contentType`。
3. 老订单 `action_type` 仍是 `dynamic_qr`，`matchesOrder` 放行。
4. 老活码 `expires_at` 为 NULL → 落地页不显示到期提示，等价于永久，符合"不改历史契约"。
5. 回滚：新列有默认值，旧代码读不到也不报错；`payment_qr_codes` 表留着不影响旧代码。

## Open Questions

- 音频没有独立 `contentType`，目前和 `file`（文档/附件）共用 ¥6 档。若后续要单独定价，需前端加音频 tab。
- 到期前是否需要主动提醒（邮件/站内信）？当前只有被动提示。
