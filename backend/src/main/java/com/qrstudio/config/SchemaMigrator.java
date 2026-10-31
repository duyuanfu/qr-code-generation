package com.qrstudio.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/**
 * 轻量级结构迁移。
 *
 * <p>项目的 schema.sql 用的是 {@code CREATE TABLE IF NOT EXISTS}，对已经存在的表不会补列。
 * 而 MySQL 8 又不支持 {@code ADD COLUMN IF NOT EXISTS}，所以新增字段需要在这里先查
 * information_schema 再决定是否 ALTER，保证每次启动都是幂等的。
 *
 * <p>迁移版本号记录在 app_migrations 表里，同一个版本只会执行一次，
 * 避免每次重启都把管理员改过的价格又刷回默认值。
 */
@Slf4j
@Component
@Order(1)
@RequiredArgsConstructor
public class SchemaMigrator implements ApplicationRunner {

    private static final String PRICING_V1 = "2026-10-pricing-tiers-v1";
    private static final String PRICING_V2 = "2026-10-per-item-pricing-v2";

    private final JdbcTemplate jdbcTemplate;

    @Override
    public void run(ApplicationArguments args) {
        try {
            ensureMigrationTable();

            // 1. 补列（幂等）
            ensureColumn("pricing_configs", "included_size_mb", "INT NOT NULL DEFAULT 0");
            ensureColumn("pricing_configs", "step_size_mb", "INT NOT NULL DEFAULT 0");
            ensureColumn("pricing_configs", "step_price", "DECIMAL(10,2) NOT NULL DEFAULT 0.00");
            ensureColumn("pricing_configs", "valid_months", "INT NOT NULL DEFAULT 3");
            ensureColumn("pricing_configs", "sort_order", "INT NOT NULL DEFAULT 0");
            ensureColumn("dynamic_qrs", "expires_at", "DATETIME NULL");
            ensureColumn("pricing_configs", "per_item", "TINYINT NOT NULL DEFAULT 0");

            // 2. 业务数据：按体积阶梯的价目表与 3 个月有效期（只执行一次）
            if (markApplied(PRICING_V1)) {
                applyPricingTiers();
                refreshPaymentNotice();
                log.info("已应用 {} 价目表迁移", PRICING_V1);
            }

            // 3. 多件按件累加 + 取消 WiFi 类型 + 静态码不再有有效期
            if (markApplied(PRICING_V2)) {
                applyPerItemPricing();
                log.info("已应用 {} 按件计价迁移", PRICING_V2);
            }
        } catch (Exception e) {
            // 迁移失败不应该阻止服务启动，但要留下明确日志
            log.error("数据库结构迁移失败: {}", e.getMessage(), e);
        }
    }

    private void ensureMigrationTable() {
        jdbcTemplate.execute("CREATE TABLE IF NOT EXISTS app_migrations ("
                + " id VARCHAR(64) PRIMARY KEY,"
                + " applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP"
                + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    }

    /** 列不存在才 ALTER，避免启动时报 Duplicate column name */
    private void ensureColumn(String table, String column, String definition) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
                Integer.class, table, column);
        if (count == null || count == 0) {
            jdbcTemplate.execute("ALTER TABLE " + table + " ADD COLUMN " + column + " " + definition);
            log.info("数据库迁移：{}.{} 已新增", table, column);
        }
    }

    /** 抢占式标记：插入成功才返回 true，保证并发/重复启动时只执行一次 */
    private boolean markApplied(String version) {
        int inserted = jdbcTemplate.update(
                "INSERT IGNORE INTO app_migrations (id) VALUES (?)", version);
        return inserted > 0;
    }

    /**
     * 价目表（按二维码类型）+ 体积阶梯。
     * <pre>
     * 文字 / 链接        2 元
     * 图片               4 元（含 10MB，超出每 5MB +1 元）
     * 音频 / 文档 / PDF   6 元（含 20MB，超出每 5MB +1 元）
     * 视频               8 元（含 30MB，超出每 5MB +1 元）
     * </pre>
     * 以上均为 3 个月服务期。
     */
    private void applyPricingTiers() {
        // item_key, 基础价, 含体积MB, 步长MB, 每步加价, 有效期月, 排序
        Object[][] rows = {
                {"dynamic_qr", "2.00", 0, 0, "0.00", 3, 0},
                {"dynamic_qr.url", "2.00", 0, 0, "0.00", 3, 10},
                {"dynamic_qr.text", "2.00", 0, 0, "0.00", 3, 20},
                {"dynamic_qr.vcard", "2.00", 0, 0, "0.00", 3, 30},
                {"dynamic_qr.image", "4.00", 10, 5, "1.00", 3, 50},
                {"dynamic_qr.pdf", "6.00", 20, 5, "1.00", 3, 60},
                {"dynamic_qr.file", "6.00", 20, 5, "1.00", 3, 70},
                {"dynamic_qr.video", "8.00", 30, 5, "1.00", 3, 80},
        };

        for (Object[] row : rows) {
            jdbcTemplate.update(
                    "UPDATE pricing_configs SET price = ?, included_size_mb = ?, step_size_mb = ?,"
                            + " step_price = ?, valid_months = ?, sort_order = ? WHERE item_key = ?",
                    row[1], row[2], row[3], row[4], row[5], row[6], row[0]);
        }

        // 导出属于另一类计费项，不参与体积阶梯，但同样给个排序值方便后台展示
        jdbcTemplate.update("UPDATE pricing_configs SET sort_order = 900 WHERE item_key = 'static_export'");

        // 历史行名的统一（老库里通用行叫「多媒体动态活码生成与托管」）
        jdbcTemplate.update(
                "UPDATE pricing_configs SET item_name = '动态活码 · 通用兜底价' WHERE item_key = 'dynamic_qr'");
        jdbcTemplate.update(
                "UPDATE pricing_configs SET item_name = '动态活码 · 文字 / 链接' WHERE item_key = 'dynamic_qr.url'");
        jdbcTemplate.update(
                "UPDATE pricing_configs SET item_name = '动态活码 · 音频 / 文档 / 附件' WHERE item_key = 'dynamic_qr.file'");
    }

    /**
     * 按件计价 + 类型调整。
     *
     * <pre>
     * 1. 图片 / PDF / 文件 / 视频 改为「按件累加」：N 个文件 = N 份基础价，
     *    体积阶梯也按单件算（3 张 2MB 图 = 3 × 4 = 12 元，而不是合计算一份）。
     * 2. 删除 WiFi 二维码类型（纯静态、无服务端成本，产品上已下线）。
     * 3. 静态二维码内容不落库，没有「服务期」概念 —— 导出费不再显示有效期。
     * 4. 把「高清导出 / 无水印」这类名不副实的叫法改成实际含义。
     * </pre>
     */
    private void applyPerItemPricing() {
        // 1) 按件累加
        jdbcTemplate.update("UPDATE pricing_configs SET per_item = 1 "
                + "WHERE item_key IN ('dynamic_qr.image','dynamic_qr.pdf','dynamic_qr.file','dynamic_qr.video')");
        // 纯文本类没有附件，保持「一份价」
        jdbcTemplate.update("UPDATE pricing_configs SET per_item = 0 "
                + "WHERE item_key IN ('dynamic_qr','dynamic_qr.url','dynamic_qr.text','dynamic_qr.vcard')");

        // 2) 下线 WiFi 类型（历史若有人手工加过，一并清掉）
        jdbcTemplate.update("DELETE FROM pricing_configs WHERE item_key = 'dynamic_qr.wifi'");

        // 3) 静态导出永久有效
        jdbcTemplate.update("UPDATE pricing_configs SET valid_months = 0 WHERE item_key = 'static_export'");

        // 4) 名称对齐实际含义
        jdbcTemplate.update(
                "UPDATE pricing_configs SET item_name = '动态活码 · 图片画廊（每张）' WHERE item_key = 'dynamic_qr.image'");
        jdbcTemplate.update(
                "UPDATE pricing_configs SET item_name = '动态活码 · PDF 文档（每份）' WHERE item_key = 'dynamic_qr.pdf'");
        jdbcTemplate.update(
                "UPDATE pricing_configs SET item_name = '动态活码 · 文件下载（每个）' WHERE item_key = 'dynamic_qr.file'");
        jdbcTemplate.update(
                "UPDATE pricing_configs SET item_name = '动态活码 · 视频播放（每条）' WHERE item_key = 'dynamic_qr.video'");
        jdbcTemplate.update(
                "UPDATE pricing_configs SET item_name = '二维码图片导出（单张 / 批量 ZIP）' WHERE item_key = 'static_export'");

        // 5) 提示语补上「静态码永久有效」
        jdbcTemplate.update(
                "UPDATE payment_configs SET notice_text = ? WHERE notice_text LIKE '%3 个月服务期%'",
                "扫码支付后点【我已完成支付】，管理员核销后自动放行。动态活码为 3 个月服务期，到期请自行续费；"
                        + "静态二维码内容不存服务器，永久有效。仅可发布合规合法信息，"
                        + "因客户自身内容违规导致二维码无法使用的，由客户自行负责。");
    }

    /** 付费弹窗的默认提示语：补充 3 个月有效期与合规免责声明 */
    private void refreshPaymentNotice() {
        List<Map<String, Object>> configs = jdbcTemplate.queryForList(
                "SELECT id, notice_text FROM payment_configs");
        for (Map<String, Object> config : configs) {
            String current = config.get("notice_text") == null ? "" : String.valueOf(config.get("notice_text"));
            // 只在还是默认文案时替换，管理员自定义过的不动
            if (current.isEmpty() || current.startsWith("请使用微信或支付宝扫描上方收款码支付")) {
                jdbcTemplate.update(
                        "UPDATE payment_configs SET notice_text = ? WHERE id = ?",
                        "扫码支付后点【我已完成支付】，管理员核销后自动放行。价格为 3 个月服务期，到期请自行续费；"
                                + "仅可发布合规合法信息，因客户自身内容违规导致二维码无法使用的，由客户自行负责。",
                        config.get("id"));
            }
        }
    }
}
