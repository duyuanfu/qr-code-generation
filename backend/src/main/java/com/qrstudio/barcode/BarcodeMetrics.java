package com.qrstudio.barcode;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 尺寸推导结果，预览与导出共用同一份，前端直接展示。
 *
 * <p><b>这里的核心是「先定整数模块像素，毫米是结果」</b>。反过来的做法（先定 40mm
 * 再把画好的图缩放过去）会让缩放系数几乎必然不是整数，EAN-13 的 1/2/3/4 模块四种条宽
 * 被取整成不等比例 —— 激光枪按边沿间距判宽度，比例错了直接判废，而人眼完全看不出问题。
 */
public record BarcodeMetrics(
        String symbology,
        String symbologyLabel,
        String normalizedContent,
        boolean checksumAppended,
        int modulePx,
        int totalModules,
        double xMm,
        double magnification,
        /** 条纹（含静区）实际占用的宽度，通常比标签宽度小一点点 */
        double widthMm,
        double heightMm,
        int labelWidthMm,
        int labelHeightMm,
        int dpi,
        int imageWidth,
        int imageHeight,
        List<String> warnings) {

    /** 低于这个条高，扫码枪的景深容错会明显变差 */
    private static final double MIN_BAR_HEIGHT_MM = 10.0;
    /** 每模块不足 2 像素，热敏机稍微走纸偏一点就会糊成一片 */
    private static final int MIN_MODULE_PX = 2;

    public static BarcodeMetrics compute(BarcodeSpec spec, BarcodeContent.Prepared prepared, int totalModules) {
        BarcodeSymbology sym = spec.symbology();
        int dpi = spec.dpi();
        int availPx = (int) Math.round(spec.labelWidthMm() / 25.4 * dpi);
        int modulePx = availPx / totalModules;

        double xMm = modulePx * 25.4 / dpi;
        double mag = xMm / sym.nominalXMm();

        if (modulePx < 1 || (sym.strictMagnification()
                && (mag < sym.minMagnification() - 1e-9 || mag > sym.maxMagnification() + 1e-9))) {
            throw new BarcodeException(400, tooTightMessage(spec, totalModules, modulePx, xMm, mag));
        }

        int imageHeight = (int) Math.round(spec.labelHeightMm() / 25.4 * dpi);
        BarcodeLayout layout = BarcodeLayout.of(availPx, imageHeight, totalModules * modulePx,
                spec.showText(), !spec.caption().isEmpty());
        double barHeightMm = layout.barHeight() * 25.4 / dpi;

        List<String> warnings = new ArrayList<>();
        if (sym.strictMagnification() && Math.abs(mag - 1.0) > 0.10) {
            double pct = (mag - 1.0) * 100;
            warnings.add(String.format("放大倍率 %.1f%%，比标准尺寸%s %.1f%%，打印后实际宽度 %.1fmm 而不是 %.0fmm",
                    mag * 100, pct > 0 ? "大" : "小", Math.abs(pct),
                    totalModules * xMm, spec.labelWidthMm()));
        }
        if (modulePx < MIN_MODULE_PX) {
            warnings.add(String.format("每模块只有 %d 个像素，打印后很可能读不出：建议改用 300dpi 或把标签加宽到 %.0fmm 以上",
                    modulePx, totalModules * 2.0 * 25.4 / dpi));
        }
        if (barHeightMm < MIN_BAR_HEIGHT_MM) {
            warnings.add(String.format("条高只有 %.1fmm（低于建议的 %.0fmm），部分扫码枪需要更近的距离才能读",
                    barHeightMm, MIN_BAR_HEIGHT_MM));
        }
        if (!sym.strictMagnification() && (xMm < 0.249 || xMm > 0.501)) {
            warnings.add(String.format("每模块 %.3fmm，超出 %s 常用的 0.250~0.500mm 范围",
                    xMm, sym.label()));
        }

        return new BarcodeMetrics(
                sym.name(),
                sym.label(),
                prepared.text(),
                prepared.checksumAppended(),
                modulePx,
                totalModules,
                round(xMm, 4),
                round(mag, 4),
                round(totalModules * xMm, 2),
                round(spec.labelHeightMm(), 1),
                (int) Math.round(spec.labelWidthMm()),
                (int) Math.round(spec.labelHeightMm()),
                dpi,
                availPx,
                imageHeight,
                List.copyOf(warnings));
    }

    /**
     * 尺寸放不下时的提示：必须给出**当前 DPI 下真正可行的宽度区间**。
     *
     * <p>只算理论值不够 —— 模块像素是整数，标准 80%~200% 的倍率区间换算到某个 DPI 上，
     * 可行的整数像素往往只有一两个取值，对应的毫米区间比理论值窄得多。
     */
    private static String tooTightMessage(BarcodeSpec spec, int totalModules, int modulePx,
                                          double xMm, double mag) {
        BarcodeSymbology sym = spec.symbology();
        int dpi = spec.dpi();
        int pxLo = (int) Math.ceil(sym.minMagnification() * sym.nominalXMm() * dpi / 25.4 - 1e-9);
        int pxHi = (int) Math.floor(sym.maxMagnification() * sym.nominalXMm() * dpi / 25.4 + 1e-9);
        String current = String.format("当前 %.0fmm 宽、%ddpi 下每模块 %d 像素（%.3fmm，相当于标准尺寸的 %.0f%%）",
                spec.labelWidthMm(), dpi, modulePx, xMm, mag * 100);

        if (pxHi < pxLo || pxHi < 1) {
            return sym.label() + " 在 " + dpi + "dpi 下无法达到标准尺寸，请换成 300dpi 或更宽的标签。" + current;
        }
        double mmLo = totalModules * pxLo * 25.4 / dpi;
        double mmHi = totalModules * (pxHi + 1) * 25.4 / dpi - 0.1;
        return String.format("%s 在 %ddpi 下每模块需落在 %d~%d 像素（相当于标签宽度 %.1f~%.1fmm）。%s",
                sym.label(), dpi, pxLo, pxHi, mmLo, mmHi, current);
    }

    private static double round(double v, int digits) {
        double f = Math.pow(10, digits);
        return Math.round(v * f) / f;
    }

    /** 给前端 / 日志用的扁平结构，字段名与 API 契约一致 */
    public Map<String, Object> asMap() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("symbology", symbology);
        m.put("symbologyLabel", symbologyLabel);
        m.put("normalizedContent", normalizedContent);
        m.put("checksumAppended", checksumAppended);
        m.put("modulePx", modulePx);
        m.put("totalModules", totalModules);
        m.put("xMm", xMm);
        m.put("magnification", magnification);
        m.put("widthMm", widthMm);
        m.put("heightMm", heightMm);
        m.put("labelWidthMm", labelWidthMm);
        m.put("labelHeightMm", labelHeightMm);
        m.put("dpi", dpi);
        m.put("imageWidth", imageWidth);
        m.put("imageHeight", imageHeight);
        m.put("warnings", warnings);
        return m;
    }
}
