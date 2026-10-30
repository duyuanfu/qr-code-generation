# QR Studio - 系统工程架构与技术交接文档 (Agent Handover Document)

> **文档定位**：本文件专为接手/协作本项目的 AI 编码 Agent（及新接手开发者）编写，旨在 3 分钟内建立对整个代码库的全局认知、技术选型底线、核心业务流转、关键避坑点与开发规范。

---

## 1. 项目全貌与核心业务价值 (Executive Summary)

**QR Studio** 是一个现代、高颜值、全功能、不限扫码次数与有效期的全栈二维码 SaaS 工作台。

### 核心能力划分
1. **纯静态离线二维码**：
   - 支持**网址 (URL)、纯文本 (Text)、vCard 3.0 电子名片、WiFi 热点连接码**。
   - **架构特性**：100% 浏览器客户端算力，不请求任何后端 API，零服务器负载，永久有效。
2. **多媒体动态活码 (Dynamic QR)**：
   - 支持**图片画廊 (Image)、视频点播 (Video)、PDF 文档 (PDF)、通用附件 (File)**。
   - 二维码内仅编码 6 位紧凑短链（如 `/q/k8f2a`），保证点阵稀疏、扫码即读。
   - 手机扫码后进入 Next.js 服务端直出的响应式移动落地页。
3. **视觉美化与模板引擎**：
   - 码点几何造型（方块、圆角、点阵、流线、大圆角）与寻象码眼（三个角）智能联动。
   - 单色/双色渐变、中心 Logo 安全防遮挡边距、海报外框与点阵密度控制（41×41 ~ 69×69）。
4. **批量作业工作台**：
   - **批量生成**：Excel (.xlsx/.xls) / CSV / 多行文本导入，多线程并发异步渲染，打包 ZIP 下载。
   - **批量解码**：多图拖拽 / 剪贴板 `Ctrl + V` 粘贴截图，浏览器原生 `BarcodeDetector` + `@zxing/library` 双引擎极速识别并导出 Excel。

---

## 2. 技术栈与架构底线规范 (Tech Stack & Constraints)

| 分层 | 选用技术 | 核心约束 / 避坑红线 (Critical Rules) |
| :--- | :--- | :--- |
| **全栈框架** | Next.js 14+ (App Router), React 18, TypeScript | 必须遵循 App Router 规范；客户端组件明确标注 `'use client'`，严禁在服务端组件直接绑定 `onClick` 等事件 |
| **样式与组件** | Tailwind CSS, Lucide React, Radix/Shadcn 风格组件 | 保持高质感设计；避免引入巨型沉重 UI 组件库 |
| **持久化引擎** | **纯 JS 原子文件引擎 (`src/db/index.ts`, `data/db.json`)** | ⚠️ **严禁引入 `better-sqlite3`、`sqlite3` 等任何基于 C++ / `node-gyp` 的原生动态库**，确保 Windows 与 Docker 无缝运行 |
| **二维码核心** | `qr-code-styling` | ⚠️ **必须使用 `toQRCodeUTF8` 转换中文字符**，否则中文在微信/扫码器中必定乱码 |
| **文件存储** | 宿主机/容器卷映射 (`data/uploads/`) | 采用 **SHA-256 内容哈希去重**；支持 HTTP 206 移动端流式分片点播 |
| **PDF 渲染** | **Canvas 矢量直绘引擎 (`MobilePdfCanvasViewer.tsx`)** | ⚠️ **严禁在移动端纯依赖 `iframe` 打开 PDF**（微信/安卓会白屏或强制下载），必须使用 Canvas 逐页解码满宽渲染 |

---

## 3. 核心目录结构与模块导航 (Directory Map)

```
qr-code-generation/
├── data/                                 # 宿主机挂载的持久化目录（git 忽略）
│   ├── db.json                           # 纯 JS 数据库（dynamicQrs 与 scanLogs）
│   └── uploads/                          # SHA-256 哈希去重存储的物理文件
├── openspec/                             # OpenSpec 规范化变更与需求规格工件
│   └── changes/                          # 历史及当前变更跟踪
├── public/                               # 静态公共资源（包含宣传海报等）
├── src/
│   ├── app/                              # Next.js 路由层 (App Router)
│   │   ├── api/                          # 后端 API 路由
│   │   │   ├── qr/dynamic/route.ts       # 活码元数据存储接口 (/api/qr/dynamic)
│   │   │   ├── system/network/route.ts   # 局域网/公网 IP 侦测接口
│   │   │   └── upload/route.ts           # 文件直传 + SHA-256 内容去重接口
│   │   ├── q/[shortId]/page.tsx          # 移动端扫码核心落地页（根据类型自适应）
│   │   ├── uploads/[filename]/route.ts   # 文件流分发接口（支持 HTTP 206 Range 分片）
│   │   ├── layout.tsx                    # 全局布局与元数据配置
│   │   └── page.tsx                      # 桌面端主工作台入口
│   ├── components/
│   │   ├── landing/                      # 扫码落地页相关交互组件
│   │   │   ├── MediaViewer.tsx           # 图片画廊、视频点播与通用文件呈现
│   │   │   ├── MobilePdfCanvasViewer.tsx # 移动端专属 PDF Canvas 矢量满宽直绘引擎
│   │   │   ├── PdfViewerModal.tsx        # 全屏沉浸式 PDF 阅读器弹窗
│   │   │   └── ShareButton.tsx           # 客户端原生/剪贴板分享组件
│   │   ├── qr/
│   │   │   └── QRCodeCanvas.tsx          # 响应式二维码画布（封装 qr-code-styling）
│   │   ├── ui/                           # 基础原子 UI (Button, Input, Tabs, Card, Badge)
│   │   └── workspace/                    # 制作端工作台分栏组件
│   │       ├── BatchDecoder.tsx          # 批量解码与 Excel 导出工作台
│   │       ├── BatchGenerator.tsx        # 批量导入并发生成工作台
│   │       ├── ContentForm.tsx           # 左侧内容动态表单
│   │       ├── ContentTypeSelector.tsx   # 8 种内容类型快速切换条
│   │       ├── DualPreview.tsx           # 右侧双模式预览（高清码 / 拟真 iPhone）
│   │       ├── Header.tsx                # 顶部模式导航栏
│   │       └── StyleConfigPanel.tsx      # 美化与模板配置面板（支持码点码眼联动）
│   ├── db/
│   │   ├── index.ts                      # 跨平台原子文件持久化实现（兼容 Drizzle 链式 API）
│   │   └── schema.ts                     # 数据表结构定义与类型声明
│   ├── lib/
│   │   ├── pdf-helpers.ts                # PDF MIME/后缀智能识别工具
│   │   ├── qr-export.ts                  # PNG/SVG/WebP 高清导出与剪贴板复制流水线
│   │   ├── qr-formatters.ts              # UTF-8 编码修复器、vCard 3.0 CRLF 格式化、WiFi 协议
│   │   ├── qr-templates.ts               # 预置行业美化模板配置
│   │   └── utils.ts                      # Tailwind 类名合并工具
│   └── types/
│       └── qr.ts                         # 全局核心领域 TypeScript 类型定义
├── Dockerfile                            # 生产环境精简多阶段 Docker 构建文件
├── docker-compose.yml                    # 容器编排配置（支持自定义端口挂载）
├── docker-entrypoint.sh                  # 容器启动钩子（自动修复挂载卷读写权限）
└── nginx.conf.example                    # 生产环境 Nginx + SSL 反代配置模板
```

---

## 4. 关键技术细节与避坑精要 (Agent Pitfalls & Solutions)

### ① 中文扫码乱码问题 (Chinese Mojibake)
- **原因**：`qr-code-styling` 底层使用 `str.charCodeAt(i) & 255` 截断字节，导致中文字符高位丢失。
- **解决标准**：所有传入二维码的数据在进入实例前，**必须经过 `toQRCodeUTF8(str)` 包装**：
  ```typescript
  export function toQRCodeUTF8(str: string): string {
    try {
      return unescape(encodeURIComponent(str));
    } catch (e) {
      return str;
    }
  }
  ```

### ② 电子名片格式兼容性 (vCard 3.0)
- **标准**：行分隔符必须是 **`\r\n` (CRLF)**，不能是 `\n`。
- **编码声明**：每个中文或可变字段必须包含 `;CHARSET=UTF-8`，姓名遵从中文习惯（`FN;CHARSET=UTF-8:张三`），保证 iPhone 通讯录与微信扫一扫一键保存联系人。

### ③ 移动端/微信打开 PDF 白屏或强制下载
- **原因**：手机浏览器普遍无内置 PDF 插件，`iframe` 直接加载会导致白屏或触发下载。
- **解决标准**：移动端落地页检测到 PDF 时，统一路由至 `MobilePdfCanvasViewer.tsx`，使用 PDF.js 将每一页按手机屏幕物理宽度 1:1 动态绘制为 Canvas，文字无锯齿、零边距全宽展现。

### ④ 文件秒传与去重机制 (Deduplication)
- 上传接口 `src/app/api/upload/route.ts` 强制计算文件二进制 **SHA-256 哈希值**作为物理文件名：
  ```typescript
  const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');
  const hashFilename = `${fileHash}${ext}`;
  ```
- 若磁盘上已存在同哈希文件，**直接复用该文件**，零磁盘写入开销，杜绝重复上传占用空间。

### ⑤ 码点与寻象码眼自动联动
- 在 `StyleConfigPanel.tsx` 中，切换码点（如选“经典方块”）时，触发联动逻辑：左上、左下、右上三个码眼的**外框与内芯自动切换为纯正方形状**；选“圆润点阵”时自动切换为全圆融。

---

## 5. 运维与部署规范 (Ops & Deployment)

- **默认端口**：`3001`（可通过 `.env` 中的 `APP_PORT` 修改，防冲突）。
- **容器构建**：
  - `Dockerfile` 采用纯静态 standalone 构建，**严禁引入 `apk add` 操作**，防止国内云服务器连接海外 Alpine 源超时卡死。
  - `docker-entrypoint.sh` 在容器开机时自动对 `/app/data` 执行 `chmod -R 777`，根除跨平台挂载权限不足问题。
- **反向代理建议**：
  - 必须配置 `client_max_body_size 100M;`（支持大视频与大文件上传）。
  - 透传 `X-Forwarded-Proto https`，确保微信与移动端安全证书锁头正常点亮。

---

## 6. 后续扩展规划 (Roadmap for Next Agents)

1. **用户与权限体系**：支持微信扫码登录/手机号注册，预留商业付费 Freemium 机制。
2. **多租户数据隔离**：将 `db.json` 中的 `dynamicQrs` 增加 `userId` 关联，落地页增加白标（去除官方底标）。
3. **数据大屏与埋点画像**：基于已有 `scanLogs` 绘制扫码热力地图、操作系统与微信扫码占比折线图。
