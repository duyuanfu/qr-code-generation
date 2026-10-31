-- QR Studio Database Schema for MySQL

CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    email VARCHAR(128) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(32) NOT NULL DEFAULT 'user',
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS dynamic_qrs (
    id VARCHAR(64) PRIMARY KEY,
    short_code VARCHAR(32) NOT NULL UNIQUE,
    user_id VARCHAR(64),
    content_type VARCHAR(32) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    media_urls LONGTEXT NOT NULL,
    style_config LONGTEXT,
    expires_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_short_code (short_code),
    INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS scan_logs (
    id VARCHAR(64) PRIMARY KEY,
    qr_id VARCHAR(64) NOT NULL,
    short_code VARCHAR(32),
    ip VARCHAR(64),
    user_agent TEXT,
    device VARCHAR(64),
    scanned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_qr_id (qr_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS orders (
    id VARCHAR(64) PRIMARY KEY,
    order_no VARCHAR(64) NOT NULL UNIQUE,
    user_id VARCHAR(64) NOT NULL,
    user_email VARCHAR(128),
    action_type VARCHAR(32) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    payment_voucher VARCHAR(255),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    paid_at DATETIME,
    INDEX idx_order_no (order_no),
    INDEX idx_user_id (user_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pricing_configs (
    id VARCHAR(64) PRIMARY KEY,
    item_key VARCHAR(32) NOT NULL UNIQUE,
    item_name VARCHAR(128) NOT NULL,
    price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    enabled TINYINT NOT NULL DEFAULT 1,
    -- 体积阶梯：基础价含 included_size_mb，超出后每 step_size_mb 加收 step_price
    included_size_mb INT NOT NULL DEFAULT 0,
    step_size_mb INT NOT NULL DEFAULT 0,
    step_price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    valid_months INT NOT NULL DEFAULT 3,
    sort_order INT NOT NULL DEFAULT 0,
    -- 1 = 按件累加（每个文件各收一次基础价），0 = 按总体积合计一份
    per_item TINYINT NOT NULL DEFAULT 0,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payment_configs (
    id VARCHAR(64) PRIMARY KEY,
    qr_image_url VARCHAR(255),
    qr_type VARCHAR(32) NOT NULL DEFAULT 'all',
    notice_text TEXT,
    enabled TINYINT NOT NULL DEFAULT 1,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 多渠道收款码：微信 / 支付宝各自一张，付费弹窗里按渠道切换展示
CREATE TABLE IF NOT EXISTS payment_qr_codes (
    id VARCHAR(64) PRIMARY KEY,
    channel VARCHAR(32) NOT NULL UNIQUE,
    channel_name VARCHAR(64) NOT NULL,
    image_url VARCHAR(255),
    enabled TINYINT NOT NULL DEFAULT 1,
    sort_order INT NOT NULL DEFAULT 0,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Initialize default pricing if empty
-- 通用行保留为兜底：某个内容类型没有单独配置价格时，回退到 dynamic_qr 的价格
-- 具体阶梯参数（含多少 MB、每超多少 MB 加价）由 SchemaMigrator 统一写入，这里只管基础列
-- ⚠️ 这里只能出现「建表语句本身就有的列」。
-- schema.sql 由 Spring 在上下文启动早期执行，而新增列是后面 SchemaMigrator 才 ALTER 上去的；
-- 如果这里引用了迁移才加的列（如 per_item），老库升级时会直接报 Unknown column 而起不来。
-- 所以 per_item / valid_months 的取值一律交给 SchemaMigrator 写入。
INSERT IGNORE INTO pricing_configs (id, item_key, item_name, price, enabled)
VALUES 
('price-dynamic-qr', 'dynamic_qr', '动态活码 · 通用兜底价', 2.00, 1),
('price-dynamic-qr-url', 'dynamic_qr.url', '动态活码 · 文字 / 链接', 2.00, 1),
('price-dynamic-qr-text', 'dynamic_qr.text', '动态活码 · 纯文本', 2.00, 1),
('price-dynamic-qr-vcard', 'dynamic_qr.vcard', '动态活码 · 电子名片', 2.00, 1),
('price-dynamic-qr-image', 'dynamic_qr.image', '动态活码 · 图片画廊（每张）', 4.00, 1),
('price-dynamic-qr-pdf', 'dynamic_qr.pdf', '动态活码 · PDF 文档（每份）', 6.00, 1),
('price-dynamic-qr-file', 'dynamic_qr.file', '动态活码 · 文件下载（每个）', 6.00, 1),
('price-dynamic-qr-video', 'dynamic_qr.video', '动态活码 · 视频播放（每条）', 8.00, 1),
-- 静态码内容不落库、无服务端成本，永久有效；收费点是导出真实内容的高清 PNG（单张或批量 ZIP）
('price-static-export', 'static_export', '二维码图片导出（单张 / 批量 ZIP）', 2.00, 1);

-- Initialize default payment config if empty
INSERT IGNORE INTO payment_configs (id, qr_image_url, qr_type, notice_text, enabled)
VALUES 
('default-pay-config', '/poster-promo-light-cn.png', 'all', '扫码支付后点【我已完成支付】，管理员核销后自动放行。价格为 3 个月服务期，到期请自行续费；仅可发布合规合法信息，因客户自身内容违规导致二维码无法使用的，由客户自行负责。', 1);

-- Initialize payment QR channels
INSERT IGNORE INTO payment_qr_codes (id, channel, channel_name, image_url, enabled, sort_order)
VALUES
('pay-qr-wechat', 'wechat', '微信支付', NULL, 1, 1),
('pay-qr-alipay', 'alipay', '支付宝', NULL, 1, 2);
