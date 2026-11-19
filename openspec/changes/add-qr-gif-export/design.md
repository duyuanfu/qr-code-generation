## Context

`qr_gif_agent_brief.md` 给出了一份已经在真实素材上跑通的 Python 参考实现（Pillow + numpy + ffmpeg + OpenCV）。它解决的是「算法与参数」问题：画布怎么裁、二维码怎么从白底反推出透明通道、衬底怎么羽化、四角怎么单独调淡、GIF 怎么用全局调色板编码才不闪。

但本项目后端是 Spring Boot 3.2.5 / Java 17，Python 生态一个都用不上。本次设计的核心工作，是**把 brief 的算法逐条映射到 Java2D 上，并重新选择校验与运行时的技术栈**——brief 默认的 OpenCV 校验方案在 Java + Alpine 组合下代价高到不可接受。

当前技术约束（已核实）：

- 生产镜像 `eclipse-temurin:17-jre-alpine`（musl libc），**刻意不执行 `apk add`**，因为国内云服务器连海外 Alpine 源会超时。
- 无任何 Python 运行时；无 OpenCV；无 ffmpeg。
- 上传链路已存在（`POST /api/upload`，按 SHA-256 落盘、秒传复用、魔数嗅探），底图与二维码图直接复用即可。
- 计费链路已存在：`POST /api/order/create` 按 `actionType` + `contentType` 命中 `pricing_configs` 的一行，支付后由业务接口携带 `orderId` 核销，一次性 `paid → used`。

## Goals / Non-Goals

**Goals:**

- 用户上传「底图 + 二维码图」，在页面上实时看到动图效果，调完参数后能拿到一段可直接发布的循环 GIF。
- 生成结果必须**真的能扫**：服务端对编码后的 GIF 抽帧解码复核，不靠人眼判断。
- 参数超出可行域时，告诉用户「调到多少能过」，并支持一键应用，而不是让他反复试。
- 计费方式与现有功能完全一致，用户不用理解第二套规则。
- 后端保持单进程、无外部任务队列，同步返回。

**Non-Goals:**

- 不做异步任务队列与进度推送（用户已确认选同步等待）。
- 不做视频（MP4/WebM）导出，只做 GIF。
- 不做字体选择器（用户确认「字体随意」）；中文统一用随 JAR 打包的 Noto Sans SC Bold。
- 不做 logo/图标贴图叠加（本轮只处理底图 + 二维码两层）。
- 不改动动态活码扫码落地页与现有定价项。

## Decisions

### D1. 渲染用 Java2D，编码用 ffmpeg，不自己写 GIF 编码器

brief 用 Pillow 做合成、ffmpeg 做编码，并明确禁止 `PIL.save(gif)`——逐帧自适应调色板会让静态区域闪烁。

Java 侧的对应做法：

- **合成**：`BufferedImage` + `Graphics2D`。brief 里的 `alpha_composite` 就是 `AlphaComposite.SrcOver`；`putalpha`（整层乘 alpha）就是逐像素改 A 通道；`resize(LANCZOS)` 用 `RenderingHints.VALUE_INTERPOLATION_BICUBIC` + `VALUE_RENDER_QUALITY`，在原图缩小 2~3 倍的场景下与 Lanczos 无肉眼差异。
- **高斯模糊**：`ConvolveOp` 只有 3×3 / 5×5 核，覆盖不了 `HALO_FEATHER ≈ 13px` 这个半径。改为**三次 box blur 逼近高斯**（可分离，横一趟纵一趟），用积分图把复杂度压到 O(W·H)，与半径无关。三次 box 对高斯的逼近误差在 3% 以内，肉眼不可分辨。**只对「衬底」和「最终二维码层」各做一次**，不进 117 帧循环。
- **GIF 编码**：仍然交给 `ffmpeg`，用 brief 实测过的 `palettegen=stats_mode=full` + `paletteuse=dither=none:diff_mode=rectangle`。理由：
  - 全局调色板 + `diff_mode=rectangle` 是体积能压到 1~3MB 的关键，`diff_mode` 让静态段只写变化矩形。
  - 自己写 GIF89a 编码器（中位切分量化 + 最近色映射 + LZW + 帧差分）约 500 行，一次写错就是花屏，调试成本远高于装一个 ffmpeg。
  - ffmpeg 顺带承担「从成品 GIF 抽帧」的复核工作（`-vsync 0` 抽末 5 帧），省一套解码逻辑。

帧序列以 PNG 落到临时目录（`{uploadDir}/.gif-tmp/{uuid}/f%04d.png`），`ProcessBuilder` 跑两遍 ffmpeg，结束即删目录。117 帧 800×800 的临时占用约 30~60MB，单个请求生命周期内释放。

**性能预算**（800×800 / 117 帧）：帧渲染与 PNG 编码 ~2.5s，ffmpeg 两遍 ~3s，抽帧校验 ~1.5s，合计 6~8s。可接受。

### D2. 可扫性校验用 ZXing，**不引入 OpenCV**

这是本次最重要的一处偏离 brief 的决定，需要说清楚三条路各自的下场：

| 方案 | 可行性 | 结论 |
|---|---|---|
| `org.bytedeco:opencv`（JavaCPP Presets） | 单平台 native 包约 250MB，`opencv-platform` 全平台 1GB+；且是 glibc 构建，**Alpine musl 下直接 `UnsatisfiedLinkError`** | 否 |
| 同上 + 换 `17-jre-jammy` | 能跑，但 brief §9 的首选引擎 `wechat_qrcode_WeChatQRCode` 属 opencv_contrib，bytedeco 未预编译，还要额外 10MB 模型文件 | 否 |
| `com.google.zxing:core:3.5.3` | 纯 Java，约 500KB，零 native，任何镜像都能跑 | **采用** |

brief 之所以优先微信引擎，是因为它对「低对比度 + 轻微模糊」的召回更高。但我们不需要「一次就解出来」——**回退机制会持续抬高对比度直到能解**。ZXing 在这里的角色是「判定当前参数够不够」，判得严一点只会让回退多走一两级，不会产出不可扫的成品。为保证召回，解码时开 `TRY_HARDER` 与 `ALSO_INVERTED`，并允许旋转 90°，每张图最多尝试 3 次。

校验条件照搬 brief §9（原尺寸 / 640+blur0.6 / 480+blur0.6，三项全过才算通过），因为这是对「小图预览、微信内嵌、屏幕压缩」三种真实消费场景的模拟。

### D3. 运行时镜像：`17-jre-alpine` → `17-jre-jammy`

不换镜像的话，ffmpeg 与 AWT 两条路都被堵死：

- **AWT 字体**：`sun.awt.FontConfiguration` 在 Alpine 上缺 fontconfig，直接抛 `Fontconfig head is null, check your fonts or fonts configuration`。装 fontconfig 又要 `apk add`。
- **ffmpeg**：Alpine 的 `ffmpeg` 包依赖一大堆 musl 重建的库，`apk add` 同样要连海外源。

换成 Ubuntu 22.04 基线（jammy）后一次解决：glibc、fontconfig、ffmpeg 全在官方源里。Dockerfile 改动要点：

```dockerfile
FROM eclipse-temurin:17-jre-jammy

# 国内构建：换阿里云源，否则 apt update 同样会卡
ARG APT_MIRROR=mirrors.aliyun.com
RUN sed -i "s|archive.ubuntu.com|${APT_MIRROR}|g; s|security.ubuntu.com|${APT_MIRROR}|g" /etc/apt/sources.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg fontconfig \
 && rm -rf /var/lib/apt/lists/*
```

`/etc/apt/sources.list` 在 jammy 上仍然存在（noble 才换成 `sources.list.d/ubuntu.sources`），所以 sed 是有效的。`APT_MIRROR` 做成 build arg，海外构建时传空或默认值即可。

代价：镜像从 ~180MB 涨到 ~400MB。一次性成本，不涉及运行时开销。

### D4. 字体随 JAR 打包，不依赖系统字体

brief 用 `C:/Windows/Fonts/msyhbd.ttc`（微软雅黑 Bold）。服务器上既没有这个文件，也不能假设宿主机装了中文字体（`fonts-noto-cjk` 一个包就 100MB+）。

做法：把 `NotoSansSC-Bold.otf`（约 8MB，SIL OFL 协议，可商用可分发）放进 `backend/src/main/resources/fonts/`，启动时 `Font.createFont(Font.TRUETYPE_FONT, inputStream)` 注册到 `GraphicsEnvironment`。好处是**渲染结果与部署环境完全无关**，本地调试和线上出的图逐像素一致。

用户在页面上看到的预览用浏览器字体（系统 sans-serif 粗体），与服务端 Noto 会有极细微的字形差异——预览定位是「看构图」，可以接受，在 UI 上注明「预览为近似效果，以生成结果为准」。

headless 模式下 `BufferedImage` + `Graphics2D` 完全可用，Spring Boot 默认已设 `java.awt.headless=true`，无需额外配置。

### D5. 计费：完全复用现有一次性订单，新增 `gif_export`

- `PricingService` 新增 `ACTION_GIF = "gif_export"`。
- `pricing_configs` 新增一行：`('price-gif-export', 'gif_export', '二维码动图（GIF）导出', 3.00, 1)`，`valid_months=0`（产物是文件，不存在服务期）、`per_item=0`（一次生成一份，与文件数无关）。
- 流程与 `static_export` 一模一样：前端在需要时弹 `PaymentModal`，拿到 `orderId` 后随生成请求提交；服务端校验订单状态 `paid`、归属当前账号、`actionType` 命中 `gif_export`，渲染成功后置 `used`。
- **生成失败不核销**：这一点与现有的「先插入后核销」不同，必须显式保证——用户为一次成功产出付费，扫不出来是我们的参数问题，不该由他买单。核销动作放在「GIF 已落盘且校验通过」之后。
- 管理员走既有的 `amount=0 → status=paid` 免单通道，无需特殊分支。
- 定价为 0 或后台关闭时 `isPaywallActive` 返回 false，直接免费生成，与现有行为一致。

**幂等与可回溯**：`orders` 表新增 `result_url VARCHAR(255) NULL`。生成成功后写入；同一 `orderId` 再次请求时直接返回该 URL，不重复渲染、不重复扣费。用户刷新页面丢了下载链接，也能从订单记录里找回。这比「核销即销毁」对客诉友好得多。

### D6. 前端 canvas 实时预览，拖拽定二维码位置

预览是纯前端 Canvas2D 渲染，与服务端走同一套几何参数，因此**免费、即时、不占后端线程**。用户调参时看到的是逐帧动画（`requestAnimationFrame` 按 25fps 步进，循环播放 4.68s），不是一张静态图——因为这段素材的卖点就是「先吊 3 秒再淡入」，静态预览看不出效果。

预览实现的取舍：

- `cover` 裁切、衬底羽化、四角淡化、`ease_out` 缓动曲线、锚点定位：全部按 brief 的公式在前端重写一遍，保持与服务端同构。
- 模糊：用 `ctx.filter = 'blur(Npx)'`，比手写卷积快一个数量级；GPU 路径与 Java box blur 的观感差异极小。
- **不做逐帧精确对齐的承诺**：文字抗锯齿、模糊核差异会导致后端成品与预览有细微不同。UI 上明确写「近似预览」，把预期管住。

二维码位置用画布拖拽实现，落库为相对画布中心的偏移比例 `qrOffsetX / qrOffsetY`（范围 -0.5~0.5），而非绝对像素——这样用户改 `outputSize` 时位置不会跑偏。

### D7. 两级校验 + 建议值一键应用

用户明确要「参数超限时返回建议值」，且选同步生成。若只在生成末尾校验失败，用户已经等了 8 秒才被告知重来，体验很差。所以把校验拆成两级：

1. **预检**（`POST /api/gif/precheck`，免费，约 0.3~0.6s）：只渲染**末帧**（最终形态），直接对内存图跑三项解码。不通过则做一次小规模探测（依次试 `qrOpacity` 0.55 / 0.70 / 0.85，`cornerMult` 同步抬高），把第一个能过的档位作为 `suggestion` 返回。
2. **成品复检**（`generate` 内部）：ffmpeg 编码完成后从 GIF 抽末 5 帧，同样三项条件复核。此时失败说明「预检过了但 256 色量化把它打死了」，自动按建议值重渲一次；仍失败则返回 `422` + `suggestion`，**订单不核销**。

这样绝大多数参数问题在 0.5 秒内就被拦住，用户点「一键应用」后立刻能看到通过的反馈，然后再付钱生成。

**回退顺序调整**（相对 brief §9）：brief 给的顺序是 `OPACITY → QR_SIZE → CORNER_MULT`，但实测（见 D8）四角系数 0.30 才是真实素材上的主要失败原因——先加 opacity 会先把整块码提亮（白块更显眼），却仍卡在四角定位失败上，白走三四轮。改为 **`cornerMult → qrOpacity → qrSize`**，每级只动一个变量，命中率显著更高。

### D8. 实测可行域（真实素材上的结论，覆盖 brief 默认值）

素材：`content.jpg`（1080² 深绿饱和底图）+ `qr.jpg`（400² 企业微信联系码）。判定标准：brief §9 三项条件全过。

| 组合 | cornerMult | qrOpacity | haloAlpha | 结果 |
|---|---|---|---|---|
| brief 默认 | 0.30 | 0.42 | 0.85 | 三档全败 |
| 仅抬 haloAlpha | 0.30 | 0.42 | 1.00 | 通过，但中心白块在饱和底上明显可见 |
| 抬四角 | 0.50 | 0.47 | 0.95 | **三档全过，产出 1.08MB** |
| 再抬四角 | 0.60 | 0.50 | 0.95 | 三档全过，白块更明显 |

**根因**：`halo_alpha=0.85` 在深绿底上等于把衬底的 15% 绿光漏进码区，白色衬底被染绿，对比度不足；而四角定位图案又被压到 0.30，定位点先失守。两者叠加，默认参数在浅底或低饱和底图上能过，在饱和底图上必挂。

**据此调整默认值**：`cornerMult=0.50`、`qrOpacity=0.47`、`haloAlpha` 改为**按底图平均亮度自动选**——底图亮度均值 > 140 用 0.85，否则用 0.95（饱和/暗底需要更实的衬底）。用户在面板上仍可覆盖，范围 0.75~1.0。

**`haloAlpha` 从「固定 0.85」升级为可调参数**，是 brief 需要修的第一处：它把「白块显眼」与「扫不出来」这对矛盾的两端交给一个写死的常数，在真实素材上必然二选一。参数化后，前端可以在预览里实时看到白块强度，让用户自己权衡。

### D9. 体积预算：目标是 1~3MB，超了降画布

brief §11 说「>8MB 降到 640」，§12 又要求「体积 1~3MB」，两者自相矛盾（3MB 就该处理，不必等到 8MB）。按 3MB 设阈值：

1. 编码完成，`stat` 文件大小。
2. 超过 `targetSizeMb`（默认 2MB，页面可改 0.5~8）→ 画布降一档（800 → 688 → 592 → 512）重编码，最多降 3 次。
3. 仍超 → 保留最后一次结果并在 `meta.warnings` 里说明，不阻断交付（用户拿到的是一份能用的、稍大的 GIF，比拿不到强）。
4. 低于 1MB 不做任何处理——说明画面本身简单，强行拉大只会糊。

画布缩小后，`qrSize`、`haloPad`、`blur` 全部按 `outputSize/800` 等比换算，保持视觉比例不变。

### D10. 并发保护：信号量 2，超出返回 429

同步生成单请求占用 6~8 秒 CPU 与 60MB 级临时磁盘。一台 2C4G 的机器同时跑 4 个请求就会把 MySQL 一起拖慢。用 `Semaphore(2)` + `tryAcquire(200ms)` 兜底，拿不到许可直接返回 `429「当前生成任务较多，请稍后重试」`，前端提示后可重试（订单未核销，重试不额外扣费）。

这不是限流的替代品，只是防止雪崩的最后一道闸。

## 参数表

前端可调项（`*` 为页面主要暴露的）：

| 字段 | 类型 | 默认 | 范围 | 说明 |
|---|---|---|---|---|
| `backgroundUrl` * | string | — | — | 底图（必填），走 `/api/upload` |
| `qrUrl` * | string | — | — | 二维码图（必填），走 `/api/upload` |
| `caption` * | string | 截图保存，扫一扫 | ≤ 24 字 | 空串则不显示 |
| `countdownTemplate` * | string | 等待{n}秒 | 含 `{n}` | 倒计时文案，`{n}` 由服务端替换 |
| `waitSeconds` * | int | 3 | 0~10 | 0 表示跳过倒计时直接淡入 |
| `fadeSeconds` | float | 1.2 | 0.3~3.0 | 淡入时长 |
| `holdSeconds` * | float | 0.5 | 0.4~10 | 常驻时长，<0.4 自动抬到 0.4 |
| `qrOffsetX` / `qrOffsetY` * | float | 0 / -0.025 | -0.5~0.5 | 相对画布中心的偏移比例，页面拖拽产生 |
| `qrSize` * | int | 320 | 240~480 | 800 基准下的边长，按 `outputSize/800` 换算 |
| `qrOpacity` * | float | 0.47 | 0.2~1.0 | 实测可扫下限约 0.45（随底图浮动） |
| `cornerMult` * | float | 0.50 | 0.3~1.0 | 四角系数，<0.3 定位必失败 |
| `haloAlpha` | float | 自动 | 0.75~1.0 | 衬底不透明度，深底默认 0.95 |
| `blur` | float | 0.85 | 0~2.0 | 随 `qrSize` 等比 |
| `outputSize` * | int | 800 | 480~1080 | 画布边长 |
| `targetSizeMb` * | float | 2.0 | 0.5~8.0 | 体积上限，超出降画布重编 |

服务端固定：`FPS=25`、`ease_out(t)=1-(1-t)^2.2`、淡入缩放 `0.92→1.0`、四角框 `0.30×QR_SIZE`、`HALO_PAD=0.067×QR_SIZE`、`HALO_FEATHER=max(8, 0.04×QR_SIZE)`。

## API 契约

```
POST /api/gif/precheck        （免费，需登录）
  body:  { ...参数表, 不含 orderId }
  200:   { ok: true }
  200:   { ok: false, reason: "四角定位图案过淡，当前参数扫不出来",
           suggestion: { cornerMult: 0.7, qrOpacity: 0.55 } }

POST /api/gif/generate        （需登录 + 已支付订单，除非计费关闭）
  body:  { ...参数表, orderId }
  200:   { ok: true, url: "/uploads/gif-<hash>.gif",
           meta: { width, height, fps, frames, duration, bytes, qrBox, attempts, warnings },
           scanCheck: { "800": true, "640_blur": true, "480_blur": true } }
  402:   需付费 / 订单无效 / 订单已使用
  422:   { ok: false, reason, suggestion }   // 未核销，用户可直接用建议值重试
  429:   排队中
```

`qrBox` 为最终二维码在画布中的 `[x, y, w, h]`（800 基准），前端可据此在预览上对齐。

## Risks / Trade-offs

- **[Risk] ZXing 召回低于微信引擎，导致回退次数变多** → 回退每级只重渲一次，单次 +2s；最坏情况 3 级共 +6s。用预检把问题挡在 0.5s 内，实际很少走到多级回退。
- **[Risk] 同步生成被并发打满** → D10 的信号量 + 429，前端引导重试（订单不核销，不重复收费）。
- **[Risk] 镜像从 180MB 涨到 400MB** → 只在构建期拉取一次，运行时无额外开销；若部署机带宽紧张，可在 CI 构建后推私有 registry。
- **[Risk] 前后端渲染不完全一致，用户觉得「预览和成品不一样」** → 显式标注「近似预览」；同时把服务端最终 `qrBox` 回传，前端可在结果页展示真实成品缩略图替代预览。
- **[Risk] 临时帧序列（117 张 PNG）写满磁盘** → 每请求独立临时目录、`finally` 删除；另加每日清理 `{uploadDir}/.gif-tmp` 残留目录与 7 天前的 `gif-*.gif`。
- **[Trade-off] 不做异步任务，单请求 6~8 秒** → 换来的是零任务表、零轮询、零状态机；在「一次生成 ≤12s」的量级下，同步是更便宜的复杂度。

## 与 brief 的偏差清单

brief 明确写了「按此实现即可」，但其中若干处与真实环境或真实素材冲突，本次按下列方式处理（改动均已在上文给出依据）：

| brief 位置 | 问题 | 处理 |
|---|---|---|
| §0 依赖 `opencv-python`（标注「可选」，但 §9 强制要求） | Java 侧无低成本对应物 | 换 ZXing，见 D2 |
| §10 `halo_alpha` 固定 0.85 | 饱和/暗底必挂，实测不动它过不了 | 参数化 + 按底图亮度自动默认，见 D8 |
| §9 回退顺序 `OPACITY → QR_SIZE → CORNER_MULT` | 真实素材上先卡四角，顺序反了白走三四轮 | 改为 `CORNER_MULT → OPACITY → QR_SIZE`，见 D7 |
| §4.3 位置 `y = ... - 20` 与 §6 `y = ... - 10` | 同一件事两个值 | 取 -20（§4.3 是定位定义） |
| §11 「>8MB 降 640」 vs §12 「体积 1~3MB」 | 阈值自相矛盾 | 统一按 `targetSizeMb`（默认 2MB）降画布，见 D9 |
| §2 `C:/Windows/Fonts/msyhbd.ttc` | 服务器无此字体 | Noto Sans SC Bold 随 JAR 打包，见 D4 |
| §9 校验用「内存里的 PIL 图」以外还要「编码后抽帧」 | 已在 brief 中提出，需落到实处 | ffmpeg `-vsync 0` 抽末 5 帧，见 D1 |
| §12 验收用例 5「第 88/90/95 帧虚化程度一致」 | 帧号与 117 帧时间轴对得上，但需自动化 | 抽帧脚本按帧号比对二维码区方差，纳入测试 |
