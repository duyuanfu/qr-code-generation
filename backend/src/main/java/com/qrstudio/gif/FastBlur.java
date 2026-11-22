package com.qrstudio.gif;

/**
 * 快速高斯模糊：三次 box blur 逼近。
 *
 * <p>为什么不用 {@code java.awt.image.ConvolveOp}：它只支持 3×3 / 5×5 的卷积核，
 * 覆盖的最大半径是 2px。而衬底羽化半径 = {@code max(8, qrSize*0.04)}，800 画布下
 * 约 13px，卷积核要 27×27 才够，代价是每像素 729 次乘加（800² 就是 4.6 亿次）。
 *
 * <p>三次 box blur 的中心极限定理近似：三次窗宽为 {@code win} 的均值滤波复合后，
 * 标准差为 {@code sqrt((win²-1)/4)}，反解出 {@code win = sqrt(4σ²+1)}。
 * 逼近误差 3% 以内，肉眼不可分辨，而每趟是 O(W·H) 且与半径无关。
 *
 * <p>边界策略：重复边缘像素（clamp），避免在图层边缘出现一圈由透明向外扩散的暗角。
 */
public final class FastBlur {

    private FastBlur() {
    }

    /**
     * 对单个浮点平面做高斯模糊。
     *
     * <p>**原地修改**并返回同一个数组：调用方拿到结果就把原引用丢掉，
     * 之前在这先 clone 一份等于每平面多分配一次 2.5MB（800 画布 × 4 平面 = 10MB/次）。
     *
     * @param sigma 标准差（≈ Pillow 的 GaussianBlur radius）
     */
    public static float[] gaussian(float[] plane, int w, int h, double sigma) {
        return gaussian(plane, null, w, h, sigma);
    }

    /**
     * 同上，但由调用方提供临时数组 {@code scratch}。
     *
     * <p>同一个尺寸连做四个平面时复用它，就把每趟的临时分配从 4 次降到 1 次。
     */
    public static float[] gaussian(float[] plane, float[] scratch, int w, int h, double sigma) {
        if (sigma < 0.35 || w <= 1 || h <= 1) {
            return plane;
        }
        double win = Math.sqrt(4 * sigma * sigma + 1);
        int r = Math.max(1, (int) Math.round((win - 1) / 2));

        float[] a = plane;
        float[] b = (scratch != null && scratch.length == plane.length) ? scratch : new float[plane.length];
        for (int pass = 0; pass < 3; pass++) {
            boxH(a, b, w, h, r);
            boxV(b, a, w, h, r);
        }
        return a;
    }

    /** 横向滑动窗口均值 */
    private static void boxH(float[] src, float[] dst, int w, int h, int r) {
        int win = 2 * r + 1;
        float inv = 1f / win;
        for (int y = 0; y < h; y++) {
            int row = y * w;
            float sum = 0;
            for (int i = -r; i <= r; i++) {
                sum += src[row + clampI(i, w)];
            }
            for (int x = 0; x < w; x++) {
                dst[row + x] = sum * inv;
                sum += src[row + clampI(x + r + 1, w)] - src[row + clampI(x - r, w)];
            }
        }
    }

    /** 纵向滑动窗口均值 */
    private static void boxV(float[] src, float[] dst, int w, int h, int r) {
        int win = 2 * r + 1;
        float inv = 1f / win;
        for (int x = 0; x < w; x++) {
            float sum = 0;
            for (int i = -r; i <= r; i++) {
                sum += src[clampI(i, h) * w + x];
            }
            for (int y = 0; y < h; y++) {
                dst[y * w + x] = sum * inv;
                sum += src[clampI(y + r + 1, h) * w + x] - src[clampI(y - r, h) * w + x];
            }
        }
    }

    private static int clampI(int v, int max) {
        return v < 0 ? 0 : (v >= max ? max - 1 : v);
    }
}
