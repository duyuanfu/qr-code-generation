package com.qrstudio.barcode;

import com.google.zxing.EncodeHintType;
import com.google.zxing.MultiFormatWriter;
import com.google.zxing.WriterException;
import com.google.zxing.common.BitMatrix;

import java.util.EnumMap;
import java.util.Map;

/**
 * ZXing 编码器封装。
 *
 * <p>用 {@code MultiFormatWriter} 而不是每个码制一个 writer：五个码制的调用方式完全一致，
 * 分发交给 ZXing。
 *
 * <p><b>坑</b>：一维码的 {@link EncodeHintType#MARGIN} 语义与二维码不同 —— 二维码是「每侧留几个模块」，
 * 一维码是「两侧合计留几个模块」（{@code OneDimensionalCodeWriter.renderResult} 里
 * {@code fullWidth = inputWidth + sidesMargin}，然后居中切分）。所以这里传的是
 * {@code quietModules * 2}，否则静区只有标准要求的一半。
 */
public final class BarcodeEncoder {

    private BarcodeEncoder() {
    }

    /**
     * 按「每模块 1 像素」量出总模块数。
     *
     * <p>Code 128 / Code 39 的模块数由内容决定（还有 A/B/C 子集选择），没法查表算，
     * 只能让编码器先出一个最窄的矩阵，宽度就是模块数。
     */
    public static BitMatrix measure(BarcodeSymbology symbology, String content) {
        return write(symbology, content, 0, 1);
    }

    /**
     * 按指定模块像素与条高编码。
     *
     * @param widthPx  应为 {@code totalModules * modulePx}，这样 ZXing 内部的放大系数正好等于 modulePx，
     *                 不会产生半像素；多留的宽度会被它居中分配到两侧静区
     * @param heightPx 条高（像素），不含数字区
     */
    public static BitMatrix write(BarcodeSymbology symbology, String content, int widthPx, int heightPx) {
        Map<EncodeHintType, Object> hints = new EnumMap<>(EncodeHintType.class);
        hints.put(EncodeHintType.MARGIN, symbology.quietModules() * 2);
        try {
            return new MultiFormatWriter().encode(content, symbology.format(), widthPx, heightPx, hints);
        } catch (WriterException | IllegalArgumentException e) {
            throw new BarcodeException(400, symbology.label() + " 编码失败：" + e.getMessage());
        }
    }
}
