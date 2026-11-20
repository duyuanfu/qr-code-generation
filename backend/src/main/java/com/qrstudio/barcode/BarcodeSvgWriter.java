package com.qrstudio.barcode;

import com.google.zxing.common.BitMatrix;

import java.util.Locale;

/**
 * 矢量输出。
 *
 * <p>坐标单位是**模块**：{@code viewBox} 用模块坐标，根节点的宽高用 {@code mm}，
 * 两者比例由标签实际尺寸决定，因此任何软件里按 100% 输出都等于设计尺寸。
 *
 * <p>条用**游程合并**的 {@code <rect>}：EAN-13 有 95 个符号模块，逐个模块输出要 95 个矩形，
 * 合并后约 30 个（连续黑模块才合成一个）。一维码所有行相同，所以每个游程只需一个矩形。
 */
public final class BarcodeSvgWriter {

    private BarcodeSvgWriter() {
    }

    public static String write(BitMatrix bars, BarcodeMetrics metrics, BarcodeSpec spec) {
        int modulePx = Math.max(1, metrics.modulePx());
        BarcodeLayout layout = BarcodeLayout.of(metrics.imageWidth(), metrics.imageHeight(),
                bars.getWidth(), spec.showText(), !spec.caption().isEmpty());

        double wUnits = metrics.imageWidth() / (double) modulePx;
        double hUnits = metrics.imageHeight() / (double) modulePx;

        StringBuilder sb = new StringBuilder(4096);
        sb.append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
        sb.append(String.format(Locale.ROOT,
                "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"%smm\" height=\"%smm\" "
                        + "viewBox=\"0 0 %s %s\">\n",
                num(spec.labelWidthMm()), num(spec.labelHeightMm()), num(wUnits), num(hUnits)));
        sb.append("  <desc>").append(escape(metrics.symbologyLabel())).append(' ')
                .append(escape(metrics.normalizedContent())).append("</desc>\n");
        sb.append("  <rect x=\"0\" y=\"0\" width=\"").append(num(wUnits)).append("\" height=\"")
                .append(num(hUnits)).append("\" fill=\"#FFFFFF\"/>\n");

        double x0 = layout.barLeft() / (double) modulePx;
        double y0 = layout.barTop() / (double) modulePx;
        double barH = layout.barHeight() / (double) modulePx;

        sb.append("  <g fill=\"#000000\">\n");
        int w = bars.getWidth();
        int runStart = -1;
        for (int x = 0; x <= w; x++) {
            boolean on = x < w && bars.get(x, 0);
            if (on && runStart < 0) {
                runStart = x;
            } else if (!on && runStart >= 0) {
                sb.append("    <rect x=\"").append(num(x0 + runStart / (double) modulePx))
                        .append("\" y=\"").append(num(y0))
                        .append("\" width=\"").append(num((x - runStart) / (double) modulePx))
                        .append("\" height=\"").append(num(barH)).append("\"/>\n");
                runStart = -1;
            }
        }
        sb.append("  </g>\n");

        if (spec.showText()) {
            appendText(sb, layout, metrics, spec, modulePx);
        }
        sb.append("</svg>\n");
        return sb.toString();
    }

    private static void appendText(StringBuilder sb, BarcodeLayout layout, BarcodeMetrics metrics,
                                   BarcodeSpec spec, int modulePx) {
        double centerX = layout.canvasW() / 2.0 / modulePx;
        int areaTop = layout.barTop() + layout.barHeight();
        int areaHeight = layout.textArea();
        String caption = spec.caption();

        sb.append("  <g fill=\"#000000\" text-anchor=\"middle\" ")
                .append("font-family=\"'Noto Sans SC','Microsoft YaHei',sans-serif\">\n");

        if (caption.isEmpty()) {
            appendLine(sb, metrics.normalizedContent(), centerX, areaTop, areaHeight, 0.70, modulePx);
        } else {
            int digitArea = (int) Math.round(areaHeight * 0.58);
            appendLine(sb, metrics.normalizedContent(), centerX, areaTop, digitArea, 0.80, modulePx);
            appendLine(sb, caption, centerX, areaTop + digitArea, areaHeight - digitArea, 0.86, modulePx);
        }
        sb.append("  </g>\n");
    }

    private static void appendLine(StringBuilder sb, String text, double centerX, int top, int height,
                                   double ratio, int modulePx) {
        if (text == null || text.isEmpty()) {
            return;
        }
        double fontSize = height * ratio / modulePx;
        // 基线近似：文字视觉中心在区域中心，基线再往下 0.35em
        double baseline = (top + height / 2.0) / modulePx + fontSize * 0.35;
        sb.append("    <text x=\"").append(num(centerX)).append("\" y=\"").append(num(baseline))
                .append("\" font-size=\"").append(num(fontSize)).append("\">")
                .append(escape(text)).append("</text>\n");
    }

    /** 最多 3 位小数，去掉尾随的 0 与小数点（SVG 里越短越好读） */
    private static String num(double v) {
        String s = String.format(Locale.ROOT, "%.3f", v);
        s = s.replaceAll("0+$", "");
        if (s.endsWith(".")) {
            s = s.substring(0, s.length() - 1);
        }
        return s.isEmpty() || "-0".equals(s) ? "0" : s;
    }

    private static String escape(String s) {
        String out = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
        return out.replace("\"", "&quot;").replace("'", "&apos;");
    }
}
