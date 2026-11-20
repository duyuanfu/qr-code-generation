package com.qrstudio.common;

import lombok.extern.slf4j.Slf4j;

import java.awt.*;
import java.io.InputStream;

/**
 * 随 JAR 打包的中文字体。
 *
 * <p>字体不依赖宿主机：服务器上既没有 Windows 的微软雅黑，装 {@code fonts-noto-cjk}
 * 又要多 100MB 镜像，而且渲染结果会随发行版字体版本漂移。打进来之后，
 * 本地调试与线上产出的图逐像素一致。
 *
 * <p>GIF 导出（倒计时、说明文字）与条形码导出（人眼可读数字、商品名备注）共用这一份。
 * 只加载一次，避免 8.5MB 字体在内存里存两份。
 */
@Slf4j
public final class BundledFonts {

    private static final String RESOURCE = "/fonts/NotoSansSC-Bold.otf";

    private static volatile Font base;

    private BundledFonts() {
    }

    /** 基础字体（已是 Bold 字重），加载失败时降级到逻辑字体 */
    public static Font base() {
        Font f = base;
        if (f != null) {
            return f;
        }
        synchronized (BundledFonts.class) {
            if (base != null) {
                return base;
            }
            base = load();
            return base;
        }
    }

    private static Font load() {
        try (InputStream in = BundledFonts.class.getResourceAsStream(RESOURCE)) {
            if (in == null) {
                log.error("中文字体缺失：classpath:{}，将降级到系统逻辑字体，中文可能显示为方块", RESOURCE);
                return new Font(Font.SANS_SERIF, Font.BOLD, 12);
            }
            Font font = Font.createFont(Font.TRUETYPE_FONT, in);
            log.info("已加载中文字体: {} ({})", font.getFontName(), font.getFamily());
            return font;
        } catch (Exception e) {
            log.error("中文字体加载失败: {}，将降级到系统逻辑字体", e.getMessage());
            return new Font(Font.SANS_SERIF, Font.BOLD, 12);
        }
    }

    /** 按像素字号取字体；不显式加 BOLD，字体文件本身就是 Bold 字重，再加会触发合成加粗 */
    public static Font at(float size) {
        return base().deriveFont(size);
    }

    /** 字体是否真的可用（用于启动自检，避免上线后才发现全是方块） */
    public static boolean canRenderChinese() {
        return base().canDisplay('等') && base().canDisplay('扫');
    }
}
