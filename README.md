# QR Studio - 全能二维码生成与美化工作台

<p align="center">
  <img src="public/poster-promo-light-cn.png" width="450" alt="QR Studio 宣传海报" style="border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.1);" />
</p>

高颜值、全功能、不限扫码次数的现代二维码 Web SaaS 平台。支持文字、网址、电子名片、图片画廊、高清视频流与各类常用文档附件的二维码生成、深度美化与批量作业。静态码永久有效，动态活码含 **3 个月服务期**（到期续费）。

---

## ✨ 核心特性

- **多内容格式生成**：
  - **离线静态码**：纯文本、网址、vCard 3.0 电子名片（永久有效、纯前端算力、0 后端负载、内容不落库）。
  - **动态多媒体活码**：图片画廊（多图连排 + 逐张下载）、高清视频播放（支持下载）、常用文档附件（PDF / Word / Excel / PPT / 压缩包 / 音频等，扫码后以文件资源管理器样式列出并逐个下载）。
- **真机双模式实时预览**：
  - 右侧高清二维码即时渲染。
  - **iPhone 拟真手机扫码落地页视图**（所见即所得，手机扫码前即可在电脑端实时预览）。
- **专业级美化与模板引擎**：
  - **几何码点**：经典方块、柔和圆角、圆润点阵、商务流线、大圆角。
  - **寻象码眼**：外框造型与内芯造型独立调配、双色独立着色。
  - **色彩系统**：单色着色、线性/径向渐变、自定义背景底色。
  - **品牌标识**：中心嵌入 Logo、自动计算安全保护边距与最高 30% 容错等级保护。
  - **边框海报**：拍立得卡片、底部横幅、顶部气泡、工业资产标牌。
  - **行业预置**：一键套用商业极简、科技霓虹、活力社交、餐饮门店、资产盘点标签模板。
- **批量作业工作台**：
  - **批量生成**：支持 Excel 表格 (`.xlsx/.xls`) 与 CSV 导入，多线程并发渲染，一键打包 ZIP 高清导出。
  - **批量解码**：支持多张图片拖拽、页面截图按 `Ctrl + V` 极速粘贴识别，原生硬件加速 + ZXing 双引擎保障，支持一键将结果导出为 Excel。
- **用户体系与付费墙**：
  - 邮箱注册/登录，`user` / `admin` 双角色，账号可后台禁用。
  - **按二维码类型分别定价**，含体积阶梯加价与服务有效期，见表；管理员终身免费。
  - 扫码支付（微信 / 支付宝双渠道收款码）→ 提交凭据 → 管理员核销 → 自动放行。
- **扫码落地页品牌露出**：所有扫码后打开的页面底部带品牌链接 `Evan 二维码 · http://qr.trythis.pw/`（全屏 PDF 阅读器用右下角浮动样式，不挡内容）。
- **管理后台 `/admin`**：
  - 用户管理、价格配置（按类型分组、体积阶梯、有效期）、收款码配置（多渠道）、订单审核四个面板，全部实时生效。
- **上传安全防线**：后缀黑白名单 + 二进制文件头（Magic Number）嗅探 + 文件名与内容敏感词拦截 + SHA-256 内容去重秒传；单文件上限 500MB，服务端流式落盘不占内存。

---

## 💰 定价

| 内容类型 | 价格 | 含体积 | 超出部分 | 计价方式 |
| :--- | :--- | :--- | :--- | :--- |
| 文字 / 链接 / 名片 | **¥2** | — | — | 一份 |
| 图片画廊 | **¥4 / 张** | 10MB | 每超 5MB **+¥1** | 按件累加 |
| PDF 文档 | **¥6 / 份** | 20MB | 每超 5MB **+¥1** | 按件累加 |
| 音频 / 文档 / 附件 | **¥6 / 个** | 20MB | 每超 5MB **+¥1** | 按件累加 |
| 视频播放 | **¥8 / 条** | 30MB | 每超 5MB **+¥1** | 按件累加 |
| 二维码图片导出（单张 / 批量 ZIP） | **¥2** | — | — | 一次性，永久可用 |

> - **动态活码为 3 个月服务期**，到期请自行续费；到期后落地页会提示续费，不会让已印出的码突然失效。
> - **按件累加**：一个活码托管 N 个文件就是 N 份成本 —— 3 张 2MB 的图片 = 3 × ¥4 = **¥12**，体积阶梯也按单件判断。
> - **静态二维码内容不存服务器**，永久有效、不设过期时间；¥2 只针对导出高清 PNG（单张或批量 ZIP）。
> - 体积以**服务端磁盘真实大小**为准，前端上报的 `size` 不参与计价。
> - 只允许发布合规合法内容；因客户自身内容违规导致二维码无法使用的，由客户自行负责。
> - 全部价格可在 `/admin` 后台实时调整（含「按件累加」开关），改完立即对新订单生效。


---

## 🛠️ 技术栈

| 分层 | 技术 |
| :--- | :--- |
| 前端 | Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, Lucide Icons |
| 后端 | Java 17, Spring Boot 3.2, MyBatis-Plus, JJWT, BCrypt |
| 数据库 | MySQL 8（utf8mb4） |
| 二维码引擎 | `qr-code-styling`（定制 UTF-8 字节流编码）, `@zxing/library` |
| 文件存储 | 本地磁盘卷 + SHA-256 内容哈希去重，支持 HTTP 206 分片播放 |
| 部署 | 服务级多阶段 Dockerfile + Docker Compose（mysql + backend + frontend） |

> 代码仓库已拆分为前后端两个独立模块：`frontend/`（Next.js）与 `backend/`（Spring Boot）。
> 浏览器侧请求经 `next.config.mjs` 的 rewrites 代理到后端，前端不再包含任何 API Route Handler。

---

## 🚀 本地开发运行

需要 **JDK 17 + Maven + MySQL 8 + Node.js 18+**。

```bash
# 1. 数据库：准备一个 MySQL 8，库名 qr_studio（JDBC 串已带 createDatabaseIfNotExist）
#    默认连接 root/root，可用环境变量覆盖

# 2. 启动后端（:8080，启动时自动建表并种入默认管理员）
cd backend && mvn spring-boot:run

# 3. 启动前端（:3001）
cd frontend && npm install && npm run dev

# 4. 浏览器访问
http://localhost:3001
```

---

## 🐳 服务器生产部署指南（Docker）

针对**服务器上已有其他业务/容器**的环境，本项目通过 `docker-compose.yml` 编排 **MySQL + 后端 + 前端** 三个服务，只对外暴露前端端口，不抢占 80/443。

### 1. 克隆代码到服务器

```bash
git clone https://github.com/duyuanfu/qr-code-generation.git
cd qr-code-generation
```

### 2. 配置环境变量

复制配置模板：
```bash
cp .env.example .env
```
按需修改 `.env`（**上线前务必替换密钥与初始口令**）：
```ini
APP_PORT=3001                 # 前端对外端口
MYSQL_ROOT_PASSWORD=change-me
MYSQL_DATABASE=qr_studio
JWT_SECRET=change-me-to-a-long-random-string
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=change-me
MOCK_PAY_ENABLED=false        # 生产环境必须 false
UPLOAD_MAX_FILE_SIZE_MB=500   # 单文件上限，需与 Nginx client_max_body_size 一起放大
NEXT_PUBLIC_BRAND_URL=http://qr.trythis.pw/   # 扫码落地页品牌链接
```

### 3. 一键启动 Docker 容器

```bash
docker compose up -d --build
```
> - MySQL 数据保存在命名卷 `mysql-data`，上传的文件挂载到宿主机 `./backend/data/uploads`。
> - 后端容器 `depends_on` MySQL 的健康检查，表结构由 `schema.sql` 在启动时幂等创建。
> - 前端镜像构建时通过 `ARG BACKEND_URL` 写入代理目标（rewrites 在构建期固化，运行时改环境变量无效）。

### 4. 绑定域名与反向代理（Nginx / 宝塔面板 / 1Panel）

由于服务器上已有其他服务，建议给该平台分配一个独立二级域名（如 `qr.yourdomain.com`）：

#### 方案 A：使用 Nginx 反向代理
在 Nginx 配置目录（如 `/etc/nginx/conf.d/`）中新建配置文件：
```nginx
server {
    listen 80;
    server_name qr.yourdomain.com; # 替换为您自己的域名

    # 关键：必须 ≥ 后端 UPLOAD_MAX_FILE_SIZE_MB（默认 500MB）+ multipart 开销
    # 若此项小于后端上限，413 会由 Nginx 直接返回 HTML 错误页，前端解析不到 JSON
    client_max_body_size 520M;

    location / {
        # 对应 docker-compose.yml 暴露的宿主机端口
        proxy_pass http://127.0.0.1:3001;
        
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # 延长超时时间以支持大文件视频上传
        proxy_connect_timeout 60s;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }
}
```
保存后重载 Nginx：`nginx -s reload`。

#### 方案 B：使用宝塔面板 / 1Panel
1. 在面板中新建网站，域名输入 `qr.yourdomain.com`。
2. 打开该站点的 **【反向代理】 -> 【添加反向代理】**：
   - 代理名称：`qr-studio`
   - 目标 URL：`http://127.0.0.1:3001`
   - 发送域名：`$host`
3. 在站点配置文件中增加 `client_max_body_size 520M;`（与后端 500MB 上限对齐），并一键申请 Let's Encrypt SSL 证书启用 HTTPS。

---

## 📱 手机扫码与落地页说明

1. **自动域名识别**：配置域名（如 `https://qr.yourdomain.com`）后，在网页上制作多媒体二维码时，系统会自动将二维码地址设为该域名，手机扫码即可直接访问。
2. **多媒体流畅点播**：
   - **图片画廊**：多张图片按原始比例纵向连排、上下紧挨，每张右下角有下载按钮；点开进入全屏灯箱，支持左右滑动、手势缩放、长按保存（微信内走原生图片预览）。
   - **流式视频**：集成微信 X5 引擎专属播放属性（`playsInline`, `x5-video-player-type="h5-page"`），支持流式分片播放无广告劫持；右上角提供下载按钮。
   - **文件附件**：扫码后像文件资源管理器一样一行一个，显示图标、文件名、`扩展名 · 体积`，整行可点即下载。
   - **电子名片**：符合 RFC 2426 标准规范，微信扫码展示专属名片页，支持【一键保存到通讯录】；iPhone 与安卓系统相机扫码直达系统联系人保存界面。
3. **品牌露出**：所有落地页**顶部**固定一条品牌栏 —— 左侧 `Evan 二维码` logo + 名称（点击回首页），右侧「进入首页」按钮，不再占用内容区。
4. **到期提示**：动态活码超过 3 个月服务期后，页面顶部出现琥珀色「服务已到期，请联系制作者续费」提示，内容仍可访问。静态二维码内容不存服务器，没有服务期，也不会出现该提示。
5. **收款码配置**：微信 / 支付宝收款码在 `/admin` →「收款码配置」上传，支持双渠道、启停与排序，改完立即对支付弹窗生效。
6. **移动端适配**：全站按手机优先设计 —— 适配刘海屏安全区（`viewport-fit=cover` + `env(safe-area-inset-*)`）、全屏阅读器用 `dvh` 避免被 iOS 地址栏遮挡、所有可点元素不小于 44×44px、导航在小屏改为横向滚动 tab 行、图片/视频加载失败时给出明确提示而不是破图或纯黑。

---

## 📄 开源许可证

本项目基于 [MIT License](LICENSE) 开源。
