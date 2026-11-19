# 任务说明（给实现 Agent）

> ## ⚠️ 本文档状态：**仅作参考，不是实现依据**
>
> 功能已按 OpenSpec 流程实现完毕，**权威来源是**：
>
> - 决策与偏差清单 → `openspec/changes/add-qr-gif-export/design.md`（D1~D10 + 「与 brief 的偏差清单」）
> - 需求条目 → `openspec/changes/add-qr-gif-export/specs/qr-gif-export/spec.md`
> - 任务与完成状态 → `openspec/changes/add-qr-gif-export/tasks.md`
> - 代码入口 → `backend/src/main/java/com/qrstudio/gif/`、`frontend/src/app/gif/`
>
> **下面这些内容已被证伪或替换，照着做会失败**：
>
> | 本文档写的 | 实际情况 |
> |---|---|
> | Pillow + numpy 图像合成 | 后端是 Java 17 / Spring Boot，改用 **Java2D**（`BufferedImage` + `AlphaComposite`），三次 box blur 逼近高斯 |
> | 校验用 `opencv-python` | 改 **ZXing `core:3.5.3`**（纯 Java，零 native）。OpenCV 的 `org.bytedeco` native 包 250MB 且 `wechat_qrcode` 无官方预编译；Python 也不在运行时里 |
> | `qr_opacity = 0.42`、`corner_mult = 0.30` | 这是**浅底素材**上的结论。白底 + 深色主体的海报上三档校验全挂，实测默认值应为 **0.70 / 0.85** |
> | 回退顺序先抬 `qr_opacity` | 顺序反了，应为 **`cornerMult → qrOpacity → qrSize`**。白底海报上先抬 opacity 只会更糊，真正卡住识别的是定位图案被压太淡 |
> | `halo_alpha` 按全图平均亮度决定 | 判据是**二维码覆盖区域的亮度 10 分位**；且值要给到 **1.00**，0.95/0.90 都会挂 |
> | 衬底羽化直接在同尺寸画布上模糊 | 同尺寸下边缘 alpha 恒为 1，**模糊等于没做**。必须四周各留 `2×feather` 作图后裁回 |
> | ffmpeg `-vsync 0` 抽帧 | ffmpeg 7 已移除该参数，必须用 **`-fps_mode passthrough`** |
>
> 保留本文档的价值在于：时间轴帧数（117 / 4.68s）、`ease_out(t) = 1 - (1-t)^2.2`、画布 cover 裁切、
> 「等待N秒」按 25 帧一段而不是逐帧递减 —— 这些是产品行为的定义，代码按原样实现，**未作改动**。
>
> 下面正文自此保留原样，不再更新。

---

你要实现一个「二维码合成 GIF」功能。本文档是完整规格，**按此实现即可，不需要额外确认设计细节**。所有数值均为实测可用的生产参数，不要"优化"或替换。

---

## 0. 交付物

一个可调用的生成函数/命令：

\`\`\`
generate_qr_gif(background, qr_image, out_path, **options) -> dict
\`\`\`

- 输入：底图（任意尺寸 JPG/PNG）+ 二维码图（JPG/PNG）+ 文案 + 时间参数
- 输出：循环 GIF 文件 + 一页元数据 dict（见 §8）
- 语言不限，但必须用 Pillow 做图像合成、ffmpeg 做 GIF 编码（Pillow 直接存 GIF 会因逐帧调色板产生闪烁，禁止使用）

依赖：\`Pillow\`、\`numpy\`、\`ffmpeg\`（系统命令）；校验用 \`opencv-python\`（可选，缺失时跳过校验并告警）。

---

## 1. 画布与时间轴

画布：\`S = 800\`，正方形，RGB。底图按 **cover** 方式缩放并居中裁切（铺满，多余裁掉）。

帧率：\`FPS = 25\`（恒定 40ms/帧）。

时间轴（默认）：

| 段 | 时长 | 帧数 | 内容 |
|---|---|---|---|
| A 倒计时 | 3.0s | 75 | 底图 + 左下角"等待N秒" |
| B 淡入 | 1.2s | 30 | 二维码层 0→1 不透明度，同时 scale 0.92→1.0 |
| C 常驻 | 0.5s | 12 | 最终形态 |

默认总帧数 **117**，总时长 **4.68s**。

- 倒计时文字：第 0~24 帧显示"等待3秒"，25~49 显示"等待2秒"，50~74 显示"等待1秒"。**不是**"3..2..1" 逐帧递减。
- 淡入缓动：\`ease_out(t) = 1 - (1-t)^2.2\`，t 为 0→1 线性进度。
- 淡入阶段缩放：\`scale = 0.92 + 0.08 * ease_out(t)\`。

---

## 2. 倒计时文字样式

- 位置：左下角，anchor \`"lb"\`，坐标 \`(52, S-46)\`
- 字体：微软雅黑 Bold（Windows: \`C:/Windows/Fonts/msyhbd.ttc\`），字号 80
- 填充纯白，描边宽 5，描边色 \`(25,25,25,235)\`
- 先在该位置 +2px 偏移处画一层 \`(0,0,0,130)\` 文字并高斯模糊 4，作为投影

---

## 3. 二维码预处理（JPG → 透明 PNG）

二维码原图先转 RGBA，**白色背景变全透明**：

\`\`\`python
a = np.asarray(qr_rgb).astype(np.float32)
alpha = 255.0 - a.min(axis=2)          # 白=0，黑/彩色=高
af = clip(alpha/255, 0, 1)
rgb = (a - 255*(1-af)) / af            # 从白底反推原色，避免半透明处发灰
rgb = clip(rgb, 0, 255)                # af≈0 的像素 rgb 置 0
out = stack([rgb, alpha])
\`\`\`

**必须做反推**。不做的话半透明边缘会发灰，扫不出来。

中间产物落盘为 \`qr.png\`（便于排查），但最终 GIF 用的是内存中的 RGBA。

---

## 4. 二维码图层合成（三层，顺序不能变）

### 4.1 白色柔光衬底

- 尺寸：\`QR_SIZE + 2*HALO_PAD\`，其中 \`HALO_PAD = round(QR_SIZE*0.067)\`
- 形状：圆角矩形，圆角 \`= round(size*0.05)\`，填充白色，alpha \`= 255*0.85\`
- 边缘羽化：整个衬底图层做 \`GaussianBlur(HALO_FEATHER)\`，\`HALO_FEATHER = max(8, round(QR_SIZE*0.04))\`
- **不加投影、不加描边、不允许出现可见矩形边界**

### 4.2 二维码本体

- 缩放到 \`QR_SIZE\`（LANCZOS）
- 四角定位图案单独调淡：

\`\`\`python
box = int(QR_SIZE*0.30)
m = zeros((QR_SIZE,QR_SIZE)); m[:box,:box]=m[:box,-box:]=m[-box:,:box]=m[-box:,-box:]=1
m = GaussianBlur(6)                    # 掩膜边界柔和
alpha_qr = alpha_qr * OPACITY * (1 - (1-CORNER_MULT)*m)
\`\`\`

- 四角以外的模块统一乘 \`OPACITY\`；四角区域额外乘 \`CORNER_MULT\`

### 4.3 位置

- 衬底左上角 \`x = (S-halo_w)//2\`，\`y = (S-halo_h)//2 - 20\`
- 二维码贴在衬底内，偏移 \`(HALO_PAD, HALO_PAD)\`

### 4.4 整体虚化

合成好的二维码层（衬底 + 二维码）整体做高斯模糊，半径 \`BLUR = 0.85\`（QR_SIZE=320 时）。

模糊对 RGB 和 Alpha 分别做，再合并：

\`\`\`python
blur_alpha = layer.getchannel("A").filter(GaussianBlur(r))
blur_rgb   = layer.convert("RGB").filter(GaussianBlur(r))
layer = blur_rgb.convert("RGBA"); layer.putalpha(blur_alpha)
\`\`\`

**禁止预乘/反预乘实现**（会因量化误差在 QR 边缘产生噪点，实测直接导致无法解码）。

---

## 5. 文案（二维码出现时）

- 文字：默认「截图保存，扫一扫」，可配置
- 位置：底部居中，anchor \`"mb"\`，\`(S/2, S-40)\`
- 样式：字号 40，粗体，白色填充 + 描边宽 5、描边色 \`(30,30,30)\`
- 不使用任何底色块
- 与二维码同步淡入：\`alpha_cap = clamp((alpha_qr_layer - 0.05) / 0.6, 0, 1)\`

---

## 6. 逐帧合成

对每一帧：

1. 底图 \`base\`（如有缩放需求用 LANCZOS）
2. 二维码层按当前 \`alpha\` 与 \`scale\` 变换：先按 scale 缩放整层，再把 alpha 通道乘上 \`alpha\`（\`putalpha\`），贴到 \`((S-sz)//2, (S-sz)//2 - 10)\`
3. \`alpha_composite\` 到底图
4. 文案层单独按 \`alpha_cap\` 合成

**注意**：虚化在淡入第一帧就已生效且全程不变；不存在"先清晰后模糊"的中间态。

---

## 7. GIF 编码

先导出 PNG 序列 \`frames/f%04d.png\`，再两遍编码：

\`\`\`bash
ffmpeg -y -framerate 25 -i frames/f%04d.png \
  -vf "palettegen=stats_mode=full:max_colors=256" palette.png

ffmpeg -y -framerate 25 -i frames/f%04d.png -i palette.png \
  -lavfi "paletteuse=dither=none:diff_mode=rectangle" -loop 0 out.gif
\`\`\`

- 必须全片共用一张调色板（\`stats_mode=full\`），否则帧间闪烁
- **必须 \`dither=none\`**。bayer / sierra 的抖动噪点会把低透明度二维码糊掉，实测 800px 下直接扫不出
- \`diff_mode=rectangle\` 控制体积

---

## 8. 元数据输出

\`\`\`json
{
  "file": "out.gif",
  "width": 800, "height": 800, "fps": 25,
  "frames": 117, "duration": 4.68,
  "qr_size": 320, "qr_opacity": 0.42, "blur": 0.85,
  "qr_box": [240, 220, 320, 320],
  "scan_check": { "800": true, "640_blur": true, "480_blur": true }
}
\`\`\`

---

## 9. 可扫性校验（必须实现）

编码完成后，从 GIF 抽帧校验，**不是**校验内存里的 PIL 图。

1. 抽帧：最后 5 帧各抽 1 张
2. 对每张图做 3 种条件：
   - 原尺寸解码
   - resize 到 640 后 \`GaussianBlur(0.6)\` 解码
   - resize 到 480 后 \`GaussianBlur(0.6)\` 解码
3. 解码器优先级：\`cv2.wechat_qrcode_WeChatQRCode()\` → 失败则 \`cv2.QRCodeDetector()\`
4. 每种条件重复 3 次，要求全部成功；任一条件失败即视为不通过

不通过时按顺序回退并重新编码（每级重试含重新编码）：

1. \`OPACITY += 0.05\`（上限 1.0）
2. \`QR_SIZE += 40\`（上限 480，同时按比例更新 HALO/BLUR）
3. \`CORNER_MULT\` 从 0.3 → 0.5
4. 仍失败：输出最后一次结果 + \`"scan_check": {"passed": false, "reason": "..."}\`，退出码非 0

> 级别 1~3 的每次尝试都必须重新走 §1~§7，不能在内存图上看结果。

---

## 10. 参数表

| 名称 | 类型 | 默认 | 范围 | 说明 |
|---|---|---|---|---|
| output_size | int | 800 | 480~1080 | 画布边长 |
| wait_seconds | int | 3 | 0~10 | 倒计时秒数，0 表示直接淡入 |
| fade_seconds | float | 1.2 | 0.3~3 | 淡入时长 |
| hold_seconds | float | 0.5 | 0.4~10 | 常驻时长，低于 0.4 抬到 0.4 并告警 |
| qr_size | int | 320 | 240~480 | 二维码边长（画布 800 基准，按 output_size/800 等比换算） |
| qr_opacity | float | 0.42 | 0.2~1.0 | 可扫下限实测约 0.40 |
| corner_mult | float | 0.3 | 0.3~1.0 | 四角系数，低于 0.3 定位失败 |
| halo_alpha | float | 0.85 | 0.75~1.0 | 低于 0.75 基本扫不出 |
| blur | float | 0.85 | 0~2.0 | 随 qr_size 等比：\`0.85 * qr_size/320\` |
| caption | str | 截图保存，扫一扫 | — | 传空串则不显示 |

---

## 11. 边界处理

| 情况 | 行为 |
|---|---|
| 二维码图检测不到码 | 抛错 \`NoQRCodeFound\`，附原图路径 |
| 二维码非正方形 | 按最长边补白居中，保持比例后再进 §3 |
| 底图比例与画布不符 | cover 裁切 |
| hold_seconds < 0.4 | 抬到 0.4 + 告警 |
| 输出 > 8MB | 画布降到 640 重编码一次 |
| 字体文件缺失 | 降级 \`simhei.ttf\`，再降级 \`PIL.ImageFont.load_default()\` 并告警 |

---

## 12. 验收用例

用当前目录的 \`content.jpg\` + \`qr.jpg\` 跑默认参数，必须满足：

1. 输出 117 帧、4.68s、800×800、体积 1~3MB
2. GIF 末帧抽出来，微信扫一扫 1 秒内可识别
3. 二维码区域看不到任何矩形边界、看不到投影
4. 四角定位图案明显比中心模块淡（灰度差 ≥ 20）
5. 逐帧检查第 88、90、95 帧：二维码虚化程度与末帧一致（不存在清晰中间态）
6. 把 \`qr_opacity\` 设为 0.1 再跑：程序自动回退并最终输出可扫结果，日志里能看到回退记录
7. 换一张完全不同的二维码（不同版本/不同密度的码）跑默认参数，无需改代码即可通过 §9

---

## 13. 禁止事项（做过一次就别再做）

- ❌ 用白卡（实心白矩形框）垫底 → 会出现明显边界
- ❌ 给二维码加投影或描边
- ❌ 用 bayer/sierra 抖动编码 GIF
- ❌ 用预乘/反预乘做大面积模糊
- ❌ 让虚化随时间增强（"先清晰后渐糊"）
- ❌ 用 Pillow 直接 \`save(gif)\`（逐帧自适应调色板 → 闪烁）
- ❌ 只靠人眼看参数，不做编码后抽帧复检
