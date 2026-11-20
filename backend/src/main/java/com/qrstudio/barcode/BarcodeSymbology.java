package com.qrstudio.barcode;

import com.google.zxing.BarcodeFormat;

import java.util.Locale;

/**
 * 支持的码制，以及每种码制的**标准物理参数**。
 *
 * <p>这里的数字不是随便定的，全部来自 GS1 General Specifications：
 * <ul>
 *   <li>EAN-13 符号 95 模块 + 左右静区各 11 模块 = 117 模块，标准 X = 0.330mm；</li>
 *   <li>EAN-8 符号 67 模块 + 静区各 7 模块 = 81 模块，标准 X = 0.330mm；</li>
 *   <li>UPC-A 符号 95 模块 + 静区各 9 模块 = 113 模块，标准 X = 0.330mm；</li>
 *   <li>Code 128 / Code 39 长度可变，X 常用 0.250~0.500mm。</li>
 * </ul>
 *
 * <p>只有 EAN/UPC 有强制的放大倍率区间（80%~200%）：这几个码制是给全球零售终端读的，
 * 偏离标准尺寸后扫码枪的边沿判读会失准。Code 128/39 是企业内部约定，只给建议不给阻断。
 */
public enum BarcodeSymbology {

    EAN_13("EAN-13", BarcodeFormat.EAN_13, 11, 0.330, 0.80, 2.00, 12, 13),
    EAN_8("EAN-8", BarcodeFormat.EAN_8, 7, 0.330, 0.80, 2.00, 7, 8),
    UPC_A("UPC-A", BarcodeFormat.UPC_A, 9, 0.330, 0.80, 2.00, 11, 12),
    CODE_128("Code 128", BarcodeFormat.CODE_128, 10, 0.250, 0.50, 2.00, -1, -1),
    CODE_39("Code 39", BarcodeFormat.CODE_39, 10, 0.250, 0.50, 2.00, -1, -1);

    private final String label;
    private final BarcodeFormat format;
    private final int quietModules;
    private final double nominalXMm;
    private final double minMagnification;
    private final double maxMagnification;
    /** 不含校验位的数据位数；-1 表示长度可变 */
    private final int dataDigits;
    /** 含校验位的完整位数；-1 表示长度可变 */
    private final int fullDigits;

    BarcodeSymbology(String label, BarcodeFormat format, int quietModules, double nominalXMm,
                     double minMagnification, double maxMagnification, int dataDigits, int fullDigits) {
        this.label = label;
        this.format = format;
        this.quietModules = quietModules;
        this.nominalXMm = nominalXMm;
        this.minMagnification = minMagnification;
        this.maxMagnification = maxMagnification;
        this.dataDigits = dataDigits;
        this.fullDigits = fullDigits;
    }

    public String label() {
        return label;
    }

    public BarcodeFormat format() {
        return format;
    }

    /** 单侧静区模块数（ZXing 一维码 writer 的 MARGIN 是「两侧合计」，见 {@link BarcodeEncoder}） */
    public int quietModules() {
        return quietModules;
    }

    public double nominalXMm() {
        return nominalXMm;
    }

    public double minMagnification() {
        return minMagnification;
    }

    public double maxMagnification() {
        return maxMagnification;
    }

    public int dataDigits() {
        return dataDigits;
    }

    public int fullDigits() {
        return fullDigits;
    }

    /** EAN/UPC 才强制放大倍率区间 */
    public boolean strictMagnification() {
        return dataDigits > 0;
    }

    public boolean hasCheckDigit() {
        return dataDigits > 0;
    }

    /**
     * 宽容解析：接受 {@code EAN_13} / {@code EAN-13} / {@code ean13} / {@code ean13} 这些写法，
     * 前端下拉框改动或有人手写请求体时不至于 400。
     */
    public static BarcodeSymbology parse(String raw) {
        if (raw == null || raw.isBlank()) {
            return EAN_13;
        }
        String key = raw.trim().toUpperCase(Locale.ROOT).replace("-", "").replace("_", "").replace(" ", "");
        for (BarcodeSymbology s : values()) {
            if (s.name().replace("_", "").equals(key)) {
                return s;
            }
        }
        throw new BarcodeException(400, "不支持的码制「" + raw + "」，可选：EAN-13 / EAN-8 / UPC-A / Code 128 / Code 39");
    }
}
