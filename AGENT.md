# QR Studio — 系统架构与接手说明（Agent Handover）

> **面向对象**：接手本项目的 AI 编码 Agent 与新加入的开发者。
> **目标**：10 分钟内建立全局认知 —— 代码在哪、请求怎么流、哪些是红线、哪些是已知坑。
>
> ⚠️ 本文档已于 2026-10-30 按**当前真实代码**重写。历史上这里描述的是「Next.js 单仓 `src/` + `db.json`」的旧架构，那套实现**已被完全移除**，若在其他地方看到相关描述（旧 PR、旧笔记），一律作废。

---

## 1. 项目定位

QR Studio 是一个二维码 SaaS 工作台，两条业务线：

1. **静态二维码**（URL / 文本 / vCard 名片）
   - 100% 浏览器算力，`qr-code-styling` 在前端直接生成，**不产生任何后端请求**，永久有效、不限扫码。
   - 内容不存服务器 ⇒ **没有服务期概念**，也不设过期时间。唯一收费点是导出真实内容的高清 PNG（单张或批量 ZIP）。WiFi 类型已于 v2 迁移动态下线。
2. **动态活码**（图片 / 视频 / PDF / 通用附件）
   - 码内只编码 6 位短码（`/q/{shortCode}`），落地页内容可随时替换而**不用重印二维码**。
   - 元数据落 MySQL，文件落磁盘卷，扫码落地页由 Next.js 服务端渲染直出。

在此之上叠了一层**订阅收费墙 + 管理后台**：普通用户生成活码 / 无水印导出需付费，管理员免单。

---

## 2. 双仓结构（最重要的一条）

这是**两个独立可部署单元**，不是一个仓库里的两套代码：

```
qr-code-generation/
├── frontend/          # Next.js 14 App Router（只负责 UI 与 SSR 落地页）
├── backend/           # Spring Boot 3.2.5 + MyBatis-Plus + MySQL 8
├── openspec/          # 需求与变更工件（Spec-Driven 流程）
├── docker-compose.yml # mysql + backend + frontend 三服务编排
└── AGENT.md
```

**职责边界（不要越界）**：

| 关注点 | 归属 | 说明 |
|---|---|---|
| 页面、组件、二维码渲染、导出 | `frontend/` | 纯客户端算力 |
| 落地页数据 | `frontend/` 的 Server Component 去**读**后端 | 但数据源只能是 Java，不允许再出现本地 JSON |
| 鉴权、计费、订单、文件校验、日志 | `backend/` | 所有业务规则只写在这里 |
| 持久化 | MySQL | 不再有任何文件型数据库 |

> 🚫 **红线**：`frontend/src/app/api/` 目录**必须保持不存在**。Next 的 `rewrites()` 属于 afterFiles 阶段，排在文件系统路由之后；一旦这里放了 `route.ts`，它会**静默抢走**本该转发给 Java 的请求，且响应结构不一致，排查成本极高。

---

## 3. 技术栈与红线

| 分层 | 技术 | 红线 / 避坑 |
|---|---|---|
| 前端框架 | Next.js 14 App Router, React 18, TS | 事件绑定必须 `'use client'`；`output: 'standalone'` |
| 样式 | Tailwind CSS + 自建 shadcn 风格原子组件 | 现有 `components/ui/*` 足够，不要引入重型组件库 |
| 后端框架 | Spring Boot 3.2.5 / Java 17 | 包根 `com.qrstudio` |
| ORM | MyBatis-Plus 3.5.x | 实体用 `@TableName`，条件用 `LambdaQueryWrapper` |
| 数据库 | MySQL 8（`utf8mb4_unicode_ci`） | 建表脚本 `backend/src/main/resources/schema.sql`，`sql.init.mode=always` 幂等执行 |
| 鉴权 | JJWT 0.12 + BCrypt | 双通道取 token：`Authorization: Bearer` 或 Cookie `token` |
| 二维码 | `qr-code-styling` | ⚠️ 中文数据**必须**过 `toQRCodeUTF8()`，否则扫码必乱码 |
| 文件存储 | 本地磁盘卷 + SHA-256 命名 | 见 §8 上传管道 |
| PDF | Canvas 矢量直绘 | ⚠️ 移动端**严禁**直接用 `iframe` 打开 PDF（微信/安卓白屏或强下载） |

---

## 4. 真实目录地图

```
frontend/src/
├── app/
│   ├── page.tsx                  # 主工作台（单张 / 批量生成 / 批量解码 三 tab）
│   ├── layout.tsx                # 全局布局 + ClientAuthWrapper
│   ├── admin/page.tsx            # 管理后台（五 tab，非管理员踢回首页）
│   └── q/[shortId]/page.tsx      # 扫码落地页（Server Component，SSR 直出）
├── components/
│   ├── admin/                    # UsersPanel / PricingPanel / PaymentConfigPanel / OrdersPanel / ExpiryPanel
│   ├── auth/                     # AuthContext / AuthModal / ClientAuthWrapper
│   ├── landing/                  # LandingHeader / MobilePdfCanvasViewer / MobileImageViewer / MobileVideoPlayer / MobileFileList / MediaViewer / PdfViewerModal / ShareButton
│   ├── qr/QRCodeCanvas.tsx       # 封装 qr-code-styling
│   ├── ui/                       # button / input / card / badge / tabs / label
│   └── workspace/                # Header / ContentForm / StyleConfigPanel / DualPreview
│                                 # PaymentModal / BatchGenerator / BatchDecoder …
├── lib/
│   ├── api-client.ts             # 浏览器侧统一请求封装：自动挂 Bearer、拆 {success,data}
│   ├── backend-api.ts            # 服务端直连 Java（落地页专用）
│   ├── qr-export.ts              # PNG/SVG/WebP 导出与剪贴板
│   ├── qr-formatters.ts          # toQRCodeUTF8 / vCard 3.0
│   ├── qr-templates.ts           # 行业美化模板
│   └── pdf-helpers.ts
└── types/                        # qr.ts（领域类型）/ admin.ts

backend/src/main/java/com/qrstudio/
├── QrStudioApplication.java      # 启动类 + 管理员种子化（CommandLineRunner）
├── common/                       # Result / JwtUtils / UserContext / FileValidator
├── config/                       # AuthInterceptor / WebConfig(CORS、/uploads 静态映射、BCrypt Bean)
├── controller/                   # Auth / DynamicQr / Order / Admin / PaymentConfig / Upload / System
├── entity/                       # User / DynamicQr / ScanLog / Order / PricingConfig / PaymentConfig
└── mapper/                       # 一一对应的 MyBatis-Plus Mapper
```

---

## 5. 请求怎么流（务必先看懂这张图再改代码）

### 5.1 浏览器 → 后端

前端**不直连** `:8080`，一律走 Next 的 rewrites：

```js
// frontend/next.config.mjs
{ source: '/api/:path*',     destination: `${BACKEND_URL}/api/:path*` }
{ source: '/uploads/:path*', destination: `${BACKEND_URL}/uploads/:path*` }
```

`BACKEND_URL` 默认 `http://localhost:8080`。

> ⚠️ **Docker 陷阱**：rewrites 在 **build 期**被写进 `routes-manifest.json`，所以 `BACKEND_URL` 必须作为 **build arg** 传入（`docker-compose.yml` 已处理），只在运行时给环境变量是无效的。

### 5.2 落地页 `/q/[shortId]`

Server Component 里不能 fetch 相对路径，因此用 `lib/backend-api.ts` **直连** `${BACKEND_URL}/api/qr/dynamic/{shortCode}`，并透传真实客户端的 `user-agent` 与 `x-forwarded-for` —— 否则扫码日志记的全是 Next 服务器的地址。

**版式选择：类型决定版式，文件本身决定能不能用这个版式**

| `contentType` | 版式 | 组件 |
|---|---|---|
| `pdf` | 整屏 Canvas 直绘 + 顶部品牌栏 | `MobilePdfCanvasViewer` |
| `image` | 白底、按原始比例纵向连排，每张右下角圆形下载钮 | `MobileImageViewer` |
| `video` | 纯黑底、铺满屏宽、原生控件 + 右上角下载胶囊 | `MobileVideoPlayer` |
| `file` / 其它 | 文件资源管理器：一行一个（图标 · 文件名 · `EXT · 体积` · 下载钮），整行可点 | `MobileFileList` |

- 上面每个分支都额外用 `isPdfFile` / `isImageFile` / `isVideoFile`（`lib/media-kind.ts`，扩展名 + MIME 双保险）做守卫：
  类型写着 `pdf` 但文件其实是 mp4 时**退化成文件列表**，绝不允许拿视频去喂 pdf.js。
- `contentType === 'file'` 里即使装的是 PDF / 图片，也一律走文件列表 —— 这类活码买的就是「一堆附件 + 下载」，不是在线阅读。
- 顶部 `LandingHeader`（`fixed inset-x-0 top-0 z-40 h-12`）承载 logo + 站名（点回首页）和「进入首页」按钮，`variant='dark'` 供视频黑底页使用；**调用方必须给内容加 `pt-12`**，否则首屏会被盖住。
- 图片查看器的全屏预览在微信里走 `WeixinJSBridge.invoke('imagePreview')`，让用户能用系统相册的保存/转发；浏览器里走自建 lightbox。

### 5.3 收费墙状态机

```
pending ──用户点「我已完成支付」──> pending_review ──管理员审核──> paid
   │                                                              │
   └──mock-pay（仅开发环境开关打开时）────────────────────────────┘
                                                                  │
                                        活码生成成功后核销  ──> used（不可复用）
```

关键规则（都在 `backend`）：

- `DynamicQrController.createDynamicQr`：非 admin 且该 `contentType` 对应定价 > 0 时，必须带 `orderId`，且同时满足 **status=paid + actionType 命中同一计费键 + 归属当前用户**，否则返回 **402**。
- **价格按二维码类型拆分**（2026-10-31 起）：计费键 = `dynamic_qr.<contentType>`，例如 `dynamic_qr.video`。`PricingService.resolve()` 先找细分键，找不到回退到通用的 `dynamic_qr`。订单落库存的是**实际命中的细分键**，所以审核页面能看出这单买的是什么。
- 两道越权校验（都在 `DynamicQrController`，`e2e-smoke` 之外的场景已手工验证）：
  - **类型越权**：用 2 元的 `url` 订单去解锁视频活码 → `402 订单对应的二维码类型不匹配，请重新下单`（`PricingService.matchesOrder`）
  - **体积/件数越权**：用 4 元的单张图片订单塞 3 张图或 200MB 文件 → `402 本次文件数量或体积超出该订单包含的额度，请重新下单补足差价`
- **内容与所选类型必须自洽**（`mediaTypeMismatch`）：`pdf` 只能装 `.pdf`，`video` 只能装视频扩展名，`image` 只能装图片扩展名，`file` 放行任意附件；不符直接 `400`。这是防「切换 tab 状态串味」写出「订单写 PDF、扫码看视频」矛盾数据的服务端兜底。
- **附件类活码不允许空着生成**（`MEDIA_REQUIRED_TYPES`）：`image` / `video` / `pdf` / `file` 的媒体列表为空 → `400 请至少上传一个文件再生成二维码`。
  历史教训：库里曾落过 8 条「付了 ¥4 却扫出一张白纸」的空壳码，只能事后直连数据库清理。
  这道校验放在**付费校验之后**——「这笔订单用过了」比「你没传文件」更紧急，业务门禁在前、数据完整性兜底在后。
- 体积以**服务端为准**：`MediaSizeResolver.sizes()` 对 `/uploads/<sha256>.<ext>` 逐个 `File.length()` 取磁盘真实大小（同时挡掉含 `/` `\` `..` 的路径穿越），只有外链才退回客户端上报的 `size`。前端改 `size` 字段没用。
  > ⚠️ `sizes()` 返回的长度**必须等于有效 url 的条目数**，测不出大小的按 `0` 计入、不能跳过。
  > 一旦跳过，按件计价就变成「托管 3 个文件只收 2 份钱」，而且订单校验（已付 ≥ 应付）还会放行，属于静默少收。
- **服务有效期**：定价项的 `valid_months`（默认 3）在生成时算成 `dynamic_qrs.expires_at`，落地页过期后展示琥珀色续费提示（内容仍可访问，不做硬断——避免客户已印出去的码直接失效）。
- 生成成功后订单置 `used` —— 同一笔订单只能生成一次；`AdminController` 也拒绝把 `used` 回滚成 `paid`。
- `OrderController` 全部接口都做归属校验（`canAccess`），管理员可越权。
- `/api/order/mock-pay` 受 `app.paywall.mock-pay-enabled` 控制，**代码默认 false**，仅本地 `application.yml` 显式打开。

#### 计价方式：按件累加（`pricing_configs.per_item`）

图片 / PDF / 文件 / 视频都是「一个活码托管 N 个文件」，N 个文件就是 N 份成本，所以这四个键 `per_item = 1`：

```
订单金额 = Σ(每个文件的 基础价 + 该文件自身的超体积加价)
3 张 2MB 图片 = 3 × ¥4 = ¥12          （不是合计 6MB 算一份 ¥4）
2 个 12MB 的文件 = 2 × (¥6 + ¥1) = ¥14
```

- `PricingService.amountForItems(actionType, contentType, List<Long> itemSizes)` 是唯一入口；
  `amountFor(...)` 与旧的单值重载都收敛到它。
- `per_item = 0` 时退回「按总体积合计一份」，用于 `url` / `text` / `vcard` 等无附件类型。
- 下单与核销**必须用同一份逐文件数组**算金额，否则「下单 ¥12、核销按 ¥4 算」会被体积校验挡下。

#### 价目表（3 个月服务期，可在 admin「价格配置」面板改）

| 计费键 | 类型 | 基础价 | 含体积 | 超出后 | 计价 | 有效期 |
|---|---|---|---|---|---|---|
| `dynamic_qr.url` / `.text` / `.vcard` | 文字 / 链接 / 名片 | ¥2.00 | — | — | 一份 | 3 个月 |
| `dynamic_qr.image` | 图片画廊 | ¥4.00 / 张 | 10MB | 每 +5MB ¥1 | **按件** | 3 个月 |
| `dynamic_qr.pdf` | PDF 文档 | ¥6.00 / 份 | 20MB | 每 +5MB ¥1 | **按件** | 3 个月 |
| `dynamic_qr.file` | 文件下载（常用格式） | ¥6.00 / 个 | 20MB | 每 +5MB ¥1 | **按件** | 3 个月 |
| `dynamic_qr.video` | 视频播放 | ¥8.00 / 条 | 30MB | 每 +5MB ¥1 | **按件** | 3 个月 |
| `dynamic_qr`（兜底行） | 未细分时回退 | ¥2.00 | — | — | 一份 | 3 个月 |
| `static_export` | 二维码图片导出（单张 / 批量 ZIP） | ¥2.00 | — | — | 一份 | **永久** |

> ⚠️ 音频沿用 `file` 类型（前端没有独立的音频 tab），两者共用 ¥6 档。
> `dynamic_qr.wifi` 已在迁移 `2026-10-per-item-pricing-v2` 中删除，前端类型选择器只剩 7 种。
> `note`：本表与 `SchemaMigrator` 里 `PRICING_V1` / `PRICING_V2` 迁移的种子行必须一致；改价走 admin 面板，**不要再回来改种子**（迁移用 `app_migrations` 抢占，改种子对已跑过的库无效）。

> 🚨 **schema.sql 只能引用建表语句里本来就有的列**。它由 Spring 在上下文启动早期执行，而新增列是 `SchemaMigrator` 之后才 `ALTER` 上去的；一旦种子 INSERT 里写了迁移才加的列（例如 `per_item`），**老库升级时会直接 `Unknown column` 起不来**。新列取值一律交给迁移写入。

#### 功能开关与按需加载

生产环境暂不开放的入口集中在 `frontend/src/lib/features.ts`：

```ts
export const FEATURES = { batchGenerate: false } as const;
```

一个开关要同时驱动两处，所以抽成模块而不是各写一个布尔值：
页面（`app/page.tsx` 拦不拦切换）和导航（`components/workspace/Header.tsx` 打不打「内测」标）。

> ⚠️ **批量作业组件必须用 `next/dynamic` 引入**。`BatchGenerator` / `BatchDecoder` 都
> `import * as XLSX`，XLSX 一个库就 400KB+。之前它们是静态 import，导致首页 First Load JS
> 高达 **305 kB**，其中绝大部分用户根本用不上（批量生成还关着）。改成按需加载后首页降到 **130 kB**。
> 加新 tab 时先问一句：这个组件的依赖，是不是每个访客都该下载？

#### 过期提醒面板（`admin` → 过期提醒）

数据来自 `GET /api/admin/dynamic-qrs`，服务端统一算好 `daysLeft` 与 `status`，前端只负责展示与分桶：

| status | 判定 | 面板归类 |
|---|---|---|
| `permanent` | `expires_at` 为空 | 长期有效 |
| `expired` | `daysLeft < 0` | 已过期 |
| `expiring` | `0 ≤ daysLeft ≤ 7` | 7 天内到期 |
| `active` | 其他 | 服务中 |

- 剩余天数**必须用服务器时间**算，客户端时钟一偏就会出现「后台说还有 1 天、落地页已提示到期」。
- 接口只 `select` 面板要显示的列：`media_urls` / `style_config` 是 LONGTEXT，
  为算个天数把整表大字段拖进内存不值当。
- 「复制提醒」生成一段可直接发给客户的话术（含到期日与活码链接），省掉运营每天手打。
- 只提醒、不改状态：到期后落地页仍可访问，只是顶部出现续费提示（见 §5.3 服务有效期）。

### 5.4 前端付费门禁：预览隔离

静态二维码的像素一旦在浏览器里画出来，截图/录屏就是拦不住的。所以前端付费点不能靠"藏"，只能靠**让未付费用户拿到的码本身就是废的**：

| 层 | 未付费 | 已付费 / 管理员 |
|---|---|---|
| 预览区 | 渲染 `previewValue` 演示码（URL 指向 `/preview-demo`，vCard 用结构相同的假数据） | 渲染真实内容 |
| 下载 / 复制 / 打印 | 弹支付 | 直接执行 |
| 批量生成 ZIP | 弹支付 | 按 600px 重绘后打包 |

实现要点（`components/workspace/DualPreview.tsx` + `app/page.tsx`）：

- `paidValue` 记录「已付费的内容」，与 `qrRawValue` **逐字比对**；改一个字就重新计费。
- 导出统一走 `lib/qr-instance.ts` 的 `createQrInstance()` **离屏重绘**，绝不复用预览画布实例 —— 否则会把手上那张演示码导给已付费用户。
- 付费成功瞬间父组件状态尚未生效，用 `justUnlocked` 先本地放行，避免"刚付完钱还是演示码"；打印额外延时 250ms 等 canvas 重绘完成。
- 批量生成只渲染 240px 缩略图供核对映射关系，付费下载时按 600px 重新渲染。

> 已知残留风险（无法消除）：静态码的内容就是用户自己输入的字符串，硬核用户可以在 DevTools 里从 React props 读到原值，拿去用别家工具生成。这层墙挡的是「顺手截图」，不是「铁了心白嫖」。真正有护城河的是**动态活码**——内容托管在我们服务器，短链由我们签发，绕过不了。

### 5.5 移动端适配基线

扫码的人在手机上，工作台用户也有一半在手机上。改任何页面前先对照这一节。

#### 三条硬规则

1. **`viewport-fit=cover` 写在 `app/layout.tsx` 的 `export const viewport`**。
   不写它，`env(safe-area-inset-*)` 恒为 0，刘海和底部 Home 条会直接压住固定栏与操作按钮。
   同时**不要锁 `maximumScale`**——落地页要能放大看 PDF 和图片。
2. **安全区一律用变量，不重复写 `env()`**。`globals.css` 里统一声明：

   ```css
   :root {
     --safe-top: env(safe-area-inset-top, 0px);
     --safe-bottom: env(safe-area-inset-bottom, 0px);
     --landing-header-h: calc(3rem + var(--safe-top));
     --app-h: 100vh;            /* 下面 @supports 升级到 100dvh */
   }
   ```

   可用工具类：`pt-landing-header`、`pb-safe`、`h-app` / `max-h-app`。
3. **`100vh` 在 iOS Safari 上包含地址栏**。全屏查看器、播放器、弹窗一律用 `--app-h`（`dvh`），
   否则底部操作条会被地址栏盖住；弹窗用 `max-h-[92dvh]`。

#### 布局

| 位置 | 做法 | 为什么 |
|---|---|---|
| 工作台导航 | 小屏（`<md`）两行：品牌 + 账号在上，tab 行横向滚动在下 | 之前品牌区 + 三段 tab + 用户区接近 740px，375px 屏直接把 body 撑出横向滚动条 |
| 表格 | `overflow-x-auto` 包裹 + `min-w-[xxx]` | 窄屏横向滚动优于压扁列宽 |
| 预览手机模型 | `<sm` 用 `w-[240px] h-[440px]`，`sm:` 起放大 | 360px 屏上 260px 模型 + 卡片内边距会溢出 |
| 卡片内边距 | `p-4 sm:p-6` | 小屏省出 16px 给内容 |

#### 触控目标

三个数字别混用，它们约束的不是同一件事：

| 标准 | 数值 | 适用 |
|---|---|---|
| WCAG 2.2 SC 2.5.8 | **24 × 24 CSS px** | Web 的硬底线，低于它算缺陷 |
| iOS HIG | 44 × 44 pt | 原生 / App 观感，本项目的实际目标 |
| Android | 48 × 48 dp | 同上 |

这套界面主体在手机上用手指点，所以**实现按 ≥44px，验收按 ≥24px**：
低于 44 尚有商量余地（密集的分段控件），低于 24 一律算 bug。

- 图标按钮用 `h-10 w-10` / `h-11 w-11`，或 `min-h-[44px]`。
- 视觉上必须小的叉号（文件删除、错误关闭）用伪元素扩热区，不改外观：
  `relative ... before:absolute before:-inset-2 before:content-['']`
- 分段控件里的选项（导出格式 `PNG/SVG/WEBP`、预览切换）常被写成 `py-1`，
  实测只有 24px 高——正好卡在底线上，一律提到 `min-h-[36px]` 以上。
- 相邻可点元素之间留 `gap-2` 以上。

#### 横向 flex 行：不给 `shrink-0` 就会塌成竖排

`flex` + `overflow-x-auto` 的横向 tab / 分段控件，子项默认 `flex-shrink: 1`。
容器一窄，浏览器不是让它滚动，而是**先把每个子项压扁**——中文没有空格可断行，
于是「模板预置」被挤成 `模/板/预/置` 四个竖排的字。这不会报错、不会溢出，
肉眼扫一眼代码也看不出来，只有真机截图才发现。

```tsx
// 反例：容器加了 overflow-x-auto，但子项没有 shrink-0
<div className="flex overflow-x-auto">
  <button className="flex items-center gap-1.5 px-3">…</button>  {/* 会被压成竖排 */}
</div>

// 正例：子项 shrink-0 + 文案不换行；移动端用简称，sm 起用全称
<button className="flex flex-1 items-center justify-center gap-1 whitespace-nowrap px-1.5 sm:flex-none sm:px-3">
  <span className="sm:hidden">模板</span>
  <span className="hidden sm:inline">模板预置</span>
</button>
```

同时容纳 6 项时，光加 `shrink-0` 会让总宽超出而必须横滑；**移动端换 2 字简称 + `flex-1` 均分**
才是真正一屏放下（`StyleConfigPanel` 的 6 个 tab 就是这么做的，实测 375px 下溢出 0px）。

#### 图标一律 `aria-hidden="true"`

`lucide-react` 的 SVG **默认不带** `aria-hidden`。旁边有可见文字的图标属于装饰，
必须标 `aria-hidden="true"`，否则读屏软件会把它当无意义图形念出来。

唯一例外是**纯图标按钮**——这时图标是唯一内容，要的不是隐藏而是给按钮一个可访问名称：

```tsx
<button aria-label="关闭支付窗口" className="h-11 w-11">…<X aria-hidden="true" /></button>
```

自查命令（应输出 0）：

```bash
# 纯图标按钮（内部去掉 svg 后无文字）缺少 aria-label / title 的
python - <<'EOF'
import re, pathlib
for p in pathlib.Path('frontend/src').rglob('*.tsx'):
    t = p.read_text(encoding='utf-8')
    for m in re.finditer(r'<button\b([^>]*)>(.*?)</button>', t, re.S):
        inner = re.sub(r'<[A-Z][A-Za-z0-9]*[^>]*/>', '', m.group(2))
        if re.sub(r'<[^>]+>', '', inner).strip(): continue
        if 'aria-label' in m.group(1) or 'title=' in m.group(1): continue
        print(p, t[:m.start()].count('\n') + 1)
EOF
```

#### 图片 / 视频 / 文件

- `<img>` / `<video>` **必须有失败降级**（`onError`）。文件被清理、外链失效时，
  没有降级就是一张破图图标或一块纯黑，用户会以为网站坏了。
- 图片加载期给 4:3 占位、视频给 16:9，否则加载完成瞬间撑开会把下方内容顶下去（CLS）。
- `touch-action: manipulation` 已在 `globals.css` 统一加到可交互元素上，消除 300ms 点击延迟。

#### 设计规范来源

`uipro` 是全局包 `ui-ux-pro-max-cli` 自带的命令（`bin: { uipro: dist/index.js }`），
别把它当成两个东西——**卸载 uipro 等于卸掉这个包本身**。它只负责"把技能包装进项目"：

```bash
uipro init --ai codebuddy        # 装到 .codebuddy/skills/（含 ui-ux-pro-max + 6 个姊妹技能）
uipro uninstall --ai codebuddy   # 卸载（会先交互确认，逐个列出将删目录）
uipro uninstall --ai universal --global   # 卸载 ~/.agents/skills 下的全局副本
```

装完用本地数据集检索（纯标准库 Python，无需联网）：

```bash
python .codebuddy/skills/ui-ux-pro-max/scripts/search.py "mobile first overflow small screen" --domain ux
python .codebuddy/skills/ui-ux-pro-max/scripts/search.py "touch target safe area" --domain web
python .codebuddy/skills/ui-ux-pro-max/scripts/search.py "mobile viewport fixed header" --stack nextjs
```

> 它**不是自动化改码工具**，产出的是设计规则文本，改代码仍靠人。
> 查询按 `--design-system`（新页面）/ `--domain`（单点问题）/ `--stack`（实现细节）三档选，
> 一次一个主意图 2–5 个词；搜不到就换个更窄的说法重试一次，别硬套无关结果。
>
> `.codebuddy/` 已被 `.gitignore` 排除（约 4.5MB，每人本地生成一次即可）。

---

## 6. API 一览

所有响应统一为 `{ success: boolean, code: number, message: string, data: T }`（上传接口例外，见 §7）。

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| POST | `/api/auth/register` | 匿名 | 邮箱 + ≥6 位密码，注册即登录 |
| POST | `/api/auth/login` | 匿名 | 返回 token 并种 HttpOnly Cookie |
| GET | `/api/auth/me` | 可选 | 未登录时 `data` 为 `null`（不报错） |
| POST | `/api/auth/logout` | 匿名 | 清 Cookie |
| POST | `/api/qr/dynamic` | 可能需付费 | 创建活码，返回 `{id, shortCode}` |
| GET | `/api/qr/dynamic/{shortCode}` | 公开 | 落地页取数，**副作用：写一条 scan_log** |
| POST | `/api/upload` | 公开 | 多文件上传，见 §7 |
| GET | `/api/payment/config` | 公开 | `{ payment, pricing, paymentQrs }`：收款提示 + 全量价目（含 `includedSizeMb` / `stepSizeMb` / `stepPrice` / `validMonths`）+ 各渠道收款码（按 `sortOrder`） |
| POST | `/api/order/create` | 登录 | 建单，body `{ actionType, contentType, mediaUrls }`；`actionType` ∈ `dynamic_qr` / `static_export`，`contentType` 缺省时 `dynamic_qr` 直接 400（定不了价） |
| GET | `/api/order/status/{id}` | 本人/管理员 | 付费墙轮询用 |
| POST | `/api/order/confirm` | 本人/管理员 | 提交「我已付款」→ `pending_review` |
| POST | `/api/order/mock-pay` | 本人/管理员 | 开发环境免审 |
| GET | `/api/admin/users` | admin | 用户列表 |
| POST | `/api/admin/users/{id}/toggle-status` | admin | 启用/禁用 |
| POST | `/api/admin/users/{id}/role` | admin | 升降级 |
| GET/POST | `/api/admin/pricing` | admin | 价目与收费开关（按 `sortOrder` 排序，含体积阶梯四件套与 `validMonths`） |
| GET/POST | `/api/admin/payment-config` | admin | 扫码提示文案与付费墙总开关 |
| GET/POST | `/api/admin/payment-qr-codes` | admin | 各渠道收款码（`wechat` / `alipay`）图片与启停 |
| GET | `/api/admin/dynamic-qrs` | admin | 活码服务期清单（含 `daysLeft` / `status`，供「过期提醒」面板） |
| GET | `/api/admin/orders` | admin | 订单流水 |
| POST | `/api/admin/orders/{id}/approve` | admin | 确认到账 |
| GET | `/api/system/network` | 公开 | 局域网 IP 探测（自定义域名提示用），**已过滤虚拟网卡**，见下 |

> `/api/system/network` 只返回手机真能连上的地址。`NetworkInterface` 会把 Hyper-V 的
> `vEthernet`、WSL、VMware、Docker 网桥、Clash/FlClash 的 TUN（常驻 `198.18.0.x`）统统列出来，
> 它们在本机有 IP 但手机永远路由不到——用户照着填，扫码必然失败且完全不知道自己填错了。
>
> 过滤三层：`isVirtual()` / `isPointToPoint()`、网卡名关键词（`vethernet`、`vmware`、`tun`、`clash`…）、
> 保留段（`169.254/16` 链路本地、`198.18/15` Clash fake-ip）。
> **兜底必须有**：整机跑在虚拟机里时全部网卡都会命中规则，过滤后为空则回退到全量列表，
> 否则用户一个地址都填不了。本机实测从 4 个收敛到 `192.168.1.7` 一个。

鉴权入口 `config/AuthInterceptor`：**进入时先 `UserContext.clear()`**，再尝试解析 token（Header Bearer 或 Cookie `token`），解析成功且回查 `users` 表通过后才写入 `UserContext`（ThreadLocal，`afterCompletion` 再清一次）。

> 为什么必须在入口清：`preHandle` 返回 `false` 时 Spring **不会**回调 `afterCompletion`，身份会留在被复用的 Tomcat 线程上。之后的匿名请求会继承上一个用户的身份——最坏情况是管理员请求之后的匿名请求直接通过 admin 校验。这个串号 bug 是 2026-10-31 联调时被 `e2e-smoke` 的「未登录访问管理接口」用例偶发 403 暴露出来的，`AuthInterceptorTest#doesNotLeakIdentityBetweenRequests` 专门守着它。

> 为什么要回查：JWT 是无状态的，账号被禁用或角色被调整后，旧 token 在过期前依然"合法"。若不查库，会出现「已封禁用户仍能建单」的越权。现在的做法是每次请求校验 `status != disabled` 并用**库里最新角色**，代价是每个 API 请求多一次主键查询——这个量级完全可接受。若将来 QPS 上去，可加 30 秒本地缓存。

只有 `/api/admin/**` 会**强制**要求 admin，`/api/upload` 强制要求登录，其余接口在自己 handler 里判断登录态。

---

## 7. 数据模型

`backend/src/main/resources/schema.sql`（7 张表，全部 `CREATE TABLE IF NOT EXISTS` + `INSERT IGNORE` 种子数据，容器每次启动幂等执行）：

- `users` — `role` ∈ `user`/`admin`，`status` ∈ `active`/`disabled`
- `dynamic_qrs` — `short_code` 唯一；`media_urls` / `style_config` 均存 **JSON 字符串**（`LONGTEXT`），取回后前端需 `JSON.parse`；`content_type` ∈ `url`/`text`/`vcard`/`image`/`video`/`pdf`/`file`（`wifi` 已于 v2 迁移下线）；`expires_at` 为服务到期时间（`valid_months` 换算而来，可空）
- `scan_logs` — 每次落地页访问一条
- `orders` — `status` ∈ `pending` / `pending_review` / `paid` / `used` / `expired`；`action_type` 存**实际命中的计费键**（如 `dynamic_qr.video`）
- `pricing_configs` — 细分键 × 9 行（见 §5.3 价目表），体积阶梯字段 `included_size_mb` / `step_size_mb` / `step_price`，计价方式 `per_item`，服务期 `valid_months`，排序 `sort_order`
- `payment_configs` — 提示文案、付费墙总开关
- `payment_qr_codes` — 多渠道收款码：`channel`（`wechat`/`alipay`）、`channel_name`、`image_url`、`enabled`、`sort_order`

> 新增列/新表不再靠"改 schema.sql 后祈祷老库也生效"——`config/SchemaMigrator`（`@Order(1)` ApplicationRunner）会在启动时用 `information_schema` 查列再 `ALTER`，并用 `app_migrations` 表 + `INSERT IGNORE` 抢占来保证一次性数据迁移只跑一次。MySQL 8 没有 `ADD COLUMN IF NOT EXISTS`，别写成 PG 语法。

> 初始管理员账号由 `QrStudioApplication` 的 `CommandLineRunner` 在**库里没有该邮箱时**种入，`schema.sql` 里没有 users 的种子语句 —— 别去 SQL 里找。
> 账号、口令、JWT 密钥均通过 `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `JWT_SECRET` 环境变量注入。
> `application.yml` 里这三项**没有回退值**，本地默认值单独放在 `application-dev.yml`（dev profile）。

---

## 8. 上传管道（`UploadController` + `FileValidator`）

**第 0 步是身份**：`/api/upload` 在 `AuthInterceptor` 里强制要求登录，匿名请求一律 401。
放行后还要过限流（`UploadRateLimitInterceptor` → `UploadRateLimiter`），超限返回 429 并带 `Retry-After`。

限流是**用户 + IP 双维度**，任一超限即拒：

| 维度 | 默认阈值 | 配置键 | 作用 |
|---|---|---|---|
| 用户 | 30 次/分钟 | `app.upload.rate-limit.user-per-minute` | 防单账号刷爆磁盘 |
| IP | 60 次/分钟 | `app.upload.rate-limit.ip-per-minute` | 防同 IP 批量注册换号绕过 |

实现是 `common/TokenBucketRateLimiter`（进程内令牌桶，零外部依赖，每 1024 次访问回收一次空闲桶）。
多实例部署时需要把 `tryAcquire` 换成 Redis 实现，**接口形态不用变**。
IP 取自 `X-Forwarded-For` 第一段（经 Next rewrites 转发后 `remoteAddr` 恒为前端服务器），回退 `X-Real-IP` / `remoteAddr`。

然后才是内容校验，分三段走，顺序绝不能乱：**元信息（体积/后缀/敏感词）→ 文件头 64 字节 → 流式落盘时按真实字节二次卡上限**。

1. `validateMeta`：体积上限 `app.upload.max-file-size-mb`（默认 **500MB**，`UPLOAD_MAX_FILE_SIZE_MB` 可覆盖）+ 扩展名黑白名单 + 文件名敏感词。这一步是常量开销，**在读了 1 个字节之前**就能把绝大多数坏请求挡掉。
2. `validateHeader`：只读前 64 字节（`HEADER_SNIFF_BYTES`）做魔数嗅探。
3. `streamToTemp`：64KB 缓冲循环写临时文件，同时增量喂 `MessageDigest`；累计字节超上限立刻抛 `UploadTooLargeException`。**全程不 `getBytes()`**，500MB 文件堆占用也是常数。

- 危险后缀直接拒：`.exe .bat .cmd .sh .php .jsp .js .html .htm .svg` 等（`.svg` 被拦是因为可内嵌脚本触发 XSS）
- 白名单：`.png .jpg .jpeg .gif .webp .mp4 .m4v .mov .webm .pdf .docx .xlsx .pptx .zip .rar .7z .txt .csv`
- 魔数表：PDF `%PDF`、PNG `\x89PNG`、JPEG `FFD8FF`、GIF `GIF8`、WebP `RIFF…WEBP`、**ISO BMFF 家族（mp4/m4v/mov）前 64 字节内找 `ftyp` box**、**WebM `1A 45 DF A3`（EBML）**、docx/xlsx/pptx/zip `PK\x03\x04`（空包 `PK\x05\x06`）、RAR `Rar!`、7z `37 7A BC AF`、txt/csv 前 64 字节无 NUL

> 视频这块踩过坑：最早只写死 `.mp4`，但 iOS 直出 `.mov`、录屏工具出 `.webm`，UI 上却宣称"支持视频"——用户传上来就报"格式不支持"。现在 `.mov`/`.m4v` 走 `ftyp` 嗅探（它们和 mp4 同属 ISO BMFF，只改扩展名不改内容），`.webm` 单独认 EBML 头。

通过后按 **SHA-256 内容哈希**命名落盘（`app.upload.dir`，默认 `data/uploads`），同哈希文件直接复用，实现秒传去重。

#### 大文件上传的两个必踩坑

**坑 1：超限时浏览器拿不到 413，只看到 "Failed to fetch"。**
根因是 Tomcat 的 `max-swallow-size` 默认只有 2MB —— 请求体被判定超限后，容器只"吞掉" 2MB 剩余数据就断开连接，浏览器正在上传的大文件被 RST，`fetch` 抛的是**网络错误**而不是 HTTP 响应。所以前端只能弹通用的"上传请求失败，请重试"，完全看不到"文件太大"这个真实原因。

修法两处，必须同时：
```yaml
server:
  tomcat:
    max-swallow-size: -1      # 让容器把剩余请求体读完，才能正常回响应
    connection-timeout: 60s
spring:
  servlet:
    multipart:
      max-file-size: 500MB    # 小于 tomcat 之外的任何中间层限制
      max-request-size: 520MB # 留出 multipart 边界与字段开销
```
```java
// common/GlobalExceptionHandler.handleMaxUploadSize -> 413 + 可读文案
{ "success": false, "code": 413, "error": "文件超过 500MB 上限，请压缩视频或拆分后重试",
                                 "message": "同上" }
```
`body` 里 `error` 和 `message` 都给，是因为上传接口失败时前端读 `error`（裸结构），而通用 `Result` 封装读 `message`。少给一个就有一边显示空白。

**坑 2：反向代理有可能替你截断。** 前面若有 nginx，`client_max_body_size` 必须同步放大，否则 413 会由 nginx 直接返回 HTML 错误页，前端 `res.json()` 解析失败。

响应结构与其它接口不同（前端 `ContentForm` 依赖此形状，改动需同步）：

```json
{ "success": true, "files": [{ "id", "name", "url": "/uploads/<hash>.<ext>", "size", "type" }] }
```

失败时同样是裸结构（`{ "success": false, "error": "..." }`），限流 429 走 `Result` 包装里的 `message`，
前端两处上传入口（`ContentForm`、`api-client.uploadSingleFile`）都对 401 / 429 单独给了文案，改错误处理时别只改一处。

`WebConfig` 把 `/uploads/**` 映射到该目录，支持 Range 分片（视频拖动进度条）。

---

## 9. 本地运行

```bash
# 1) 数据库：需要一个 MySQL 8，库名 qr_studio（JDBC 串带 createDatabaseIfNotExist=true）

# 2) 后端（:8080，启动即建表 + 种子管理员）
#    dev profile 提供本地口令与模拟支付开关；不带 profile 时必须显式给环境变量
cd backend && mvn spring-boot:run -Dspring-boot.run.profiles=dev

# 3) 前端（:3001）
cd frontend && npm install && npm run dev
```

### 配置分层（敏感值只在环境变量里）

`application.yml` 里 **DB 口令、JWT 密钥、管理员口令三项都写成 `${VAR}` 且没有回退值**，
缺失时 Spring 启动直接报错 —— 这是刻意的，为了让「忘配密钥」在启动期暴露，而不是带着
开发口令悄悄上线。`QrStudioApplication` 的 `@Value("${app.admin.password}")` 同理，不再有硬编码默认值。

| 变量 | 用途 | 本地开发 |
|---|---|---|
| `DB_PASSWORD` | MySQL 口令（用户名 `DB_USERNAME`，默认 root） | `application-dev.yml` 里 `root` |
| `JWT_SECRET` | 签名密钥，≥32 字节 | `application-dev.yml` 里的固定 dev 串 |
| `ADMIN_PASSWORD` | 首次启动种子化管理员的口令 | `application-dev.yml` 里 |
| `MOCK_PAY_ENABLED` | 模拟支付，**默认 false** | dev profile 里 `true` |

> 只有 `ADMIN_EMAIL` 保留默认值（非敏感）。`MOCK_PAY_ENABLED` 从「默认 true」改成
> 「默认 false」：漏配的后果从「任何人可免单」变成「收款需人工退款」，方向选错得更安全。

一键编排（需要 Docker）：

```bash
cp .env.example .env   # 必须填 MYSQL_ROOT_PASSWORD / JWT_SECRET / ADMIN_PASSWORD
docker compose up -d --build
```

`docker-compose.yml` 里这三项用 `${VAR:?提示}` 写法，缺变量时 compose 直接报错退出，
容器根本不会起来。

- 服务：`mysql:3306`（healthcheck）+ `backend:8080` + `frontend:3001`
- 上传卷统一挂到 `./backend/data/uploads`，与本地开发路径一致（两套路径会丢文件）
- `frontend/Dockerfile` 三阶段 standalone；`backend/Dockerfile` maven → jre-alpine，**不执行 `apk add`**（国内云连 Alpine 源易超时）

> ⚠️ 若后端启动后监听的**不是 8080**，先查环境变量：Spring 的宽松绑定会把 `SERVER__PORT` / `SERVER_PORT` 也当成 `server.port`。某些 IDE / Agent 沙箱会注入这类变量，命令行参数 `--server.port=8080` 优先级最高，可强制覆盖。

---

## 10. 已知技术债 / 待办

| 项 | 状态 |
|---|---|
| 端到端联调（tasks 5.5） | ✅ 已完成。四个脚本共 **69 项断言**全绿（详见 §10.1），另有后端 14 个单元测试 |
| CI | ✅ `.github/workflows/ci.yml`：后端打包 + 前端类型检查/构建 + 真实 MySQL 的端到端联调 |
| 单元测试 / 组件测试 | ⚠️ 后端已有 14 个（`TokenBucketRateLimiterTest` 5 + `AuthInterceptorTest` 9，`mvn test` 全绿）；业务 Controller、前端 Jest/Playwright 仍为空白 |
| UI 交互自动化 | ❌ 未覆盖。付费弹窗、二维码渲染与导出、批量生成/解码、PDF Canvas、Admin 面板点击需人工验证 |
| Docker 镜像构建 | ✅ 已纳入 CI，但默认不跑，需在 Actions 里手动触发 `workflow_dispatch` |
| 登录爆破防护 | ⚠️ `/api/auth/login` 仍无限流（上传已加），建议复用 `TokenBucketRateLimiter` 按 IP 限速 |
| 活码删除接口 | ❌ 缺失。admin 只能看不能删，清理脏数据只能直连 MySQL 写一次性脚本（本轮清掉 39 条就是这么干的）。补一个 `DELETE /api/admin/dynamic-qrs/{id}` 时记得**同时删 `scan_logs`**（无外键） |
| 上传文件生命周期 | ⚠️ 上传即落盘，但「上传了却没生成活码」的文件无人回收，长期只增不减。反过来，手动清理上传目录会让存量活码静默 404 —— 本轮删除遗留目录后 34 条活码一夜变白屏，就是没有引用计数的代价 |
| e2e 脚本不回收自建数据 | ⚠️ 每次跑 `e2e-*.mjs` 都会在库里留下「E2E 联调活码 / 免费模式活码」。要么用独立测试库，要么脚本收尾时自删 |
| 迁移前遗留数据 `frontend/data/` | **保留未删**（`db.json` + `sqlite.db`），未导入 MySQL。`uploads/` 子目录已于 2026-10-31 清理 |
| `openspec/changes/*` 未归档 | 变更完成后应移到 `changes/archive/` 并沉淀到 `specs/` |
| 扫码日志埋点 | 数据已在 `scan_logs`，尚未做可视化 |

---

## 10.1 联调与自查脚本

四个脚本都只走公开 HTTP 接口，不直连数据库，脚本内**不含任何密钥**（管理员口令通过环境变量传入）：

```bash
# 管理员口令取自 application.yml 的 app.admin.password 回退值
export ADMIN_PASSWORD='<口令>'

node scripts/e2e-smoke.mjs              # 主链路：注册/上传/收费墙/订单状态机/越权/合规（32 项）
node scripts/e2e-admin.mjs              # 管理端：用户禁用与角色、改价与免费模式、收款配置、模拟支付（27 项）
node scripts/e2e-upload-guard.mjs       # 上传防护：匿名 401、正常放行、429 限流与 Retry-After、按 key 分桶（9 项）
node scripts/check-disabled-token.mjs   # 安全自查：账号禁用后旧 token 是否立即失效（1 项）

# 指定其它后端地址
BASE_URL=http://localhost:8080 node scripts/e2e-smoke.mjs
```

> `e2e-admin.mjs` 会临时改价、改提示文案、升降级用户，**全部在 `finally` 里恢复原值**，中断也不会留脏配置。
>
> `e2e-upload-guard.mjs` 用 `X-Forwarded-For: 203.0.113.x`（TEST-NET-3 文档专用段）模拟不同来源 IP，
> 因此连续打满 60 次限流不会污染真实 IP 的配额，也不影响其它脚本。

---

## 10.2 CI（`.github/workflows/ci.yml`）

| Job | 做什么 | 触发 |
|---|---|---|
| `backend` | `mvn -DskipTests package`，上传 jar 产物 | push main / PR / 手动 |
| `frontend` | `npm ci` → `tsc --noEmit` → `next build` | 同上 |
| `e2e` | 起 MySQL 8 service，跑 jar，执行三个联调脚本 | 同上（依赖 `backend` 产物） |
| `docker` | 实际 `docker build` 前后端镜像 | **仅手动触发**，省构建分钟数 |

CI 里的管理员口令、JWT 密钥都是 `ci-*` 前缀的假值，从 `env` 注入，**不会进仓库也不会影响生产**。
若 `e2e` 挂了，日志会 `tail -n 200 /tmp/backend.log`，直接能看到 Spring 启动异常或 SQL 报错。

新增接口时记得同步补一条断言到对应脚本，否则 CI 绿了不代表功能没退化。

---

## 11. 改代码的规矩

1. **业务规则只写在后端**。前端任何「按钮置灰 / 弹窗拦截」都只是体验优化，服务端必须能独立拦住。
2. **不要把接口写回 `frontend/src/app/api/`**，原因见 §2 红线。
3. **新增接口** 时同步三处：`schema.sql`（若涉及建表）、`backend` controller、`frontend/src/types` + `lib/api-client.ts`。
4. **改动响应结构** 要连带检查 `lib/api-client.ts` 的拆包逻辑与 `ContentForm` 的上传解析。
5. **敏感信息**（密钥、初始口令）走环境变量，不要硬编码进仓库。
6. **本机环境注意**：`frontend/.next` 有近 2000 个文件，直接 `rm -rf .next` 会触发环境的批量删除保护；重建前请先 `mv .next /tmp/xxx` 再 `npm run build`。

---

## 12. 编码细节备忘录

- **中文乱码**：`qr-code-styling` 底层 `charCodeAt(i) & 255` 会截断字节，所有入参先过 `toQRCodeUTF8(str)`（`encodeURIComponent` + `unescape`）。
- **vCard 3.0**：行分隔符必须 `\r\n`，中文字段带 `;CHARSET=UTF-8`，否则 iPhone 通讯录存进去是乱码。
- **码点 / 码眼联动**：`StyleConfigPanel` 切换码点形状时，三个寻象码眼的外框与内芯要同步切换，否则视觉割裂。
- **移动端 PDF**：统一走 `MobilePdfCanvasViewer`（PDF.js 逐页按屏宽绘 Canvas），不要用 `iframe`。
- **落地页 `mediaUrls`**：Java 存的是 JSON 字符串，用 `parseMediaList()` 兼容字符串/数组两种形态。
