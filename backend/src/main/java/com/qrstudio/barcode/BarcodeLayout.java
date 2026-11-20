package com.qrstudio.barcode;

/**
 * 标签内部的版面分配（像素）。
 *
 * <p>上下留白与文字区固定按标签高度的比例给：条高不承载信息，可以自由压缩，
 * 但上下必须留出一点白边，否则热敏打印机的切刀/边缘会把最外侧的条切掉。
 */
public record BarcodeLayout(
        int canvasW,
        int canvasH,
        int barLeft,
        int barTop,
        int barHeight,
        int textArea) {

    /** 上方留白占标签高度 */
    private static final double TOP_RATIO = 0.08;
    /** 无数字时，下方也按这个比例留白 */
    private static final double BOTTOM_RATIO = 0.08;
    /** 有数字时的文字区高度占比；带备注时多留一点 */
    private static final double TEXT_RATIO = 0.16;
    private static final double TEXT_RATIO_WITH_CAPTION = 0.22;

    public static BarcodeLayout of(int canvasW, int canvasH, int barWidthPx,
                                   boolean showText, boolean hasCaption) {
        int top = (int) Math.round(canvasH * TOP_RATIO);
        int textArea = showText
                ? (int) Math.round(canvasH * (hasCaption ? TEXT_RATIO_WITH_CAPTION : TEXT_RATIO))
                : (int) Math.round(canvasH * BOTTOM_RATIO);
        int barHeight = Math.max(1, canvasH - top - textArea);
        int barLeft = Math.max(0, (canvasW - barWidthPx) / 2);
        return new BarcodeLayout(canvasW, canvasH, barLeft, top, barHeight, textArea);
    }
}
