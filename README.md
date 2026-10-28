# QR Studio - 全能二维码生成与美化工作台

<p align="center">
  <img src="public/poster-promo-light-cn.png" width="450" alt="QR Studio 宣传海报" style="border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.1);" />
</p>

高颜值、全功能、不限扫码次数与有效期的现代二维码 Web SaaS 平台。支持文字、网址、电子名片、WiFi、图片画廊、高清视频流与各类文档附件的二维码生成、深度美化与批量作业。

---

## ✨ 核心特性

- **多内容格式生成**：
  - **离线静态码**：纯文本、网址、vCard 3.0 电子名片、WiFi 连接码（永久有效、纯前端算力、0 后端负载）。
  - **动态多媒体活码**：支持图片画廊、高清视频点播、各类文档附件（PDF/Word/Excel/ZIP）扫码即览与高速下载。
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
- **纯 JavaScript 跨平台持久化**：
  - 彻底移除了对 C++ 原生动态链接库（`node-gyp`）的依赖，使用纯 JavaScript 原子化文件存储引擎。
  - 在 **Windows、macOS、Linux、WSL 以及 Docker** 之间无缝流转，彻底杜绝跨平台编译报错。

---

## 🛠️ 技术栈

- **前端框架**：Next.js 14+ (App Router), React 18, TypeScript
- **样式系统**：Tailwind CSS, Lucide Icons
- **二维码引擎**：`qr-code-styling` (定制 UTF-8 字节流编码), `@zxing/library`
- **数据持久化**：纯 JS 轻量原子化文件持久层 (`./data/db.json`)
- **文件与多媒体**：支持 HTTP 206 移动端流式切片播放与大文件直传 (`./data/uploads/`)
- **容器化**：多阶段轻量 Dockerfile 与 Docker Compose 编排

---

## 🚀 本地开发运行

```bash
# 1. 安装依赖
npm install

# 2. 启动开发服务器（默认端口 3001）
npm run dev

# 3. 浏览器访问
http://localhost:3001
```

---

## 🐳 服务器生产部署指南（Docker）

针对**服务器上已有其他业务/容器**的环境，本项目设计为单容器独立运行，不抢占 80/443 等常用端口，内存占用低且数据安全独立。

### 1. 克隆代码到服务器

```bash
git clone https://github.com/duyuanfu/qr-code-generation.git
cd qr-code-generation
```

### 2. 配置环境端口（防冲突）

复制配置模板：
```bash
cp .env.example .env
```
查看 `.env` 文件，如果 `3001` 端口已被服务器其他程序占用，可修改为任意未被占用的端口（如 `8090`）：
```ini
APP_PORT=3001
PORT=3001
NODE_ENV=production
DATABASE_PATH=/app/data/db.json
```

### 3. 一键启动 Docker 容器

```bash
docker compose up -d --build
```
> 容器启动后，数据和上传的资源会自动持久化保存在宿主机的 `./data` 目录下。

### 4. 绑定域名与反向代理（Nginx / 宝塔面板 / 1Panel）

由于服务器上已有其他服务，建议给该平台分配一个独立二级域名（如 `qr.yourdomain.com`）：

#### 方案 A：使用 Nginx 反向代理
在 Nginx 配置目录（如 `/etc/nginx/conf.d/`）中新建配置文件：
```nginx
server {
    listen 80;
    server_name qr.yourdomain.com; # 替换为您自己的域名

    # 关键：允许上传大文件和高清视频（建议 100M 或以上）
    client_max_body_size 100M;

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
3. 在站点配置文件中增加 `client_max_body_size 100M;`，并一键申请 Let's Encrypt SSL 证书启用 HTTPS。

---

## 📱 手机扫码与落地页说明

1. **自动域名识别**：配置域名（如 `https://qr.yourdomain.com`）后，在网页上制作多媒体二维码时，系统会自动将二维码地址设为该域名，手机扫码即可直接访问。
2. **多媒体流畅点播**：
   - **图片画廊**：手机端点开支持大图灯箱浏览、手势缩放与长按保存原图。
   - **流式视频**：集成微信 X5 引擎专属播放属性（`playsInline`, `x5-video-player-type="h5-page"`），支持流式分片播放无广告劫持。
   - **电子名片**：符合 RFC 2426 标准规范，微信扫码展示专属名片页，支持【一键保存到通讯录】；iPhone 与安卓系统相机扫码直达系统联系人保存界面。

---

## 📄 开源许可证

本项目基于 [MIT License](LICENSE) 开源。
