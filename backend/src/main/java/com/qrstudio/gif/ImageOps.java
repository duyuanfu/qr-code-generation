package com.qrstudio.gif;

import java.awt.image.BufferedImage;
import java.awt.image.DataBufferInt;

/** 图像基础操作：cover 裁切、高质量缩放、ARGB 存取。 */
public final class ImageOps {

    private ImageOps() {
    }

    /**
     * cover 缩放：铺满目标画布，多出来的部分居中裁掉。
     *
     * <p>与 contain 相反 —— 我们宁可裁掉底图边缘，也不能出现留白，
     * 因为留白会让二维码衬底边界变得可见。
     */
    public static BufferedImage cover(BufferedImage src, int size) {
        int sw = src.getWidth();
        int sh = src.getHeight();
        double scale = Math.max(size / (double) sw, size / (double) sh);
        int dw = Math.max(1, (int) Math.round(sw * scale));
        int dh = Math.max(1, (int) Math.round(sh * scale));

        BufferedImage scaled = resize(src, dw, dh);

        BufferedImage out = new BufferedImage(size, size, BufferedImage.TYPE_INT_RGB);
        int ox = (dw - size) / 2;
        int oy = (dh - size) / 2;
        var g = out.createGraphics();
        g.drawImage(scaled, -ox, -oy, null);
        g.dispose();
        return out;
    }

    /** 高质量缩放，结果保留源图的色彩模型（含 alpha） */
    public static BufferedImage resize(BufferedImage src, int w, int h) {
        int type = src.getColorModel().hasAlpha()
                ? BufferedImage.TYPE_INT_ARGB
                : BufferedImage.TYPE_INT_RGB;
        BufferedImage out = new BufferedImage(w, h, type);
        var g = out.createGraphics();
        g.setRenderingHint(java.awt.RenderingHints.KEY_INTERPOLATION,
                java.awt.RenderingHints.VALUE_INTERPOLATION_BICUBIC);
        g.setRenderingHint(java.awt.RenderingHints.KEY_RENDERING,
                java.awt.RenderingHints.VALUE_RENDER_QUALITY);
        g.setRenderingHint(java.awt.RenderingHints.KEY_ANTIALIASING,
                java.awt.RenderingHints.VALUE_ANTIALIAS_ON);
        g.drawImage(src, 0, 0, w, h, null);
        g.dispose();
        return out;
    }

    /** 取底层 int[] 做原地读写（调用方需保证图是 TYPE_INT_ARGB / TYPE_INT_RGB） */
    public static int[] pixels(BufferedImage img) {
        return ((DataBufferInt) img.getRaster().getDataBuffer()).getData();
    }

    /** 新建一张 ARGB 画布，初始全透明 */
    public static BufferedImage newArgb(int w, int h) {
        return new BufferedImage(w, h, BufferedImage.TYPE_INT_ARGB);
    }

    /**
     * 逐通道拆分（非预乘 alpha）。
     *
     * <p>brief §4.4 明确禁止预乘/反预乘路径：量化误差会在二维码边缘产生噪点，
     * 实测直接导致无法解码。所以模糊在四个独立平面上做，最后再合成。
     */
    public static float[][] splitArgb(BufferedImage img) {
        int w = img.getWidth();
        int h = img.getHeight();
        int[] px = pixels(img);
        int n = w * h;
        float[][] planes = new float[4][n];
        for (int i = 0; i < n; i++) {
            int c = px[i];
            planes[0][i] = (c >>> 24) & 0xFF;
            planes[1][i] = (c >>> 16) & 0xFF;
            planes[2][i] = (c >>> 8) & 0xFF;
            planes[3][i] = c & 0xFF;
        }
        return planes;
    }

    /** 与 {@link #splitArgb} 配套，把四个平面合回 ARGB 图（通道取整并夹取） */
    public static BufferedImage mergeArgb(float[][] planes, int w, int h) {
        BufferedImage out = new BufferedImage(w, h, BufferedImage.TYPE_INT_ARGB);
        int[] px = pixels(out);
        int n = w * h;
        for (int i = 0; i < n; i++) {
            int a = clamp255(planes[0][i]);
            int r = clamp255(planes[1][i]);
            int g = clamp255(planes[2][i]);
            int b = clamp255(planes[3][i]);
            // 全透明像素的 RGB 归零：否则远程看到的「隐形」像素会带颜色，边缘发灰
            if (a == 0) {
                px[i] = 0;
            } else {
                px[i] = (a << 24) | (r << 16) | (g << 8) | b;
            }
        }
        return out;
    }

    public static int clamp255(float v) {
        int i = Math.round(v);
        return i < 0 ? 0 : (i > 255 ? 255 : i);
    }

    /** 整层乘一个 alpha 系数（等价于 brief 里的 putalpha） */
    public static void multiplyAlpha(BufferedImage img, double factor) {
        int[] px = pixels(img);
        for (int i = 0; i < px.length; i++) {
            int a = (px[i] >>> 24) & 0xFF;
            int na = (int) Math.round(a * factor);
            px[i] = (na << 24) | (px[i] & 0x00FFFFFF);
        }
    }

    /** 底图平均亮度，用来决定衬底要多实 */
    public static double averageLuma(BufferedImage img) {
        int[] px = pixels(img);
        long sum = 0;
        // 抽样即可：800×800 全量也没问题，但没必要
        int step = Math.max(1, px.length / 20000);
        int count = 0;
        for (int i = 0; i < px.length; i += step) {
            int c = px[i];
            int r = (c >>> 16) & 0xFF;
            int g = (c >>> 8) & 0xFF;
            int b = c & 0xFF;
            sum += Math.round(0.299 * r + 0.587 * g + 0.114 * b);
            count++;
        }
        return count == 0 ? 128 : sum / (double) count;
    }

    /**
     * 指定矩形区域内亮度的一个低分位值。
     *
     * <p>为什么不用平均值：二维码可能落在一张「大部分白、局部深色」的图上
     * （典型就是企微名片海报，白底 + 深色衣服）。平均亮度很高，会误判成
     * 「浅底，衬底可以用 0.95」，而真正决定可扫性的是码区下面那块深色。
     * 取 10 分位就是取「最暗的那一小块」，它才是需要被压住的对象。
     */
    public static double darkLumaIn(BufferedImage img, int rx, int ry, int rw, int rh) {
        int w = img.getWidth();
        int h = img.getHeight();
        int x0 = Math.max(0, rx);
        int y0 = Math.max(0, ry);
        int x1 = Math.min(w, rx + rw);
        int y1 = Math.min(h, ry + rh);
        if (x1 <= x0 || y1 <= y0) {
            return averageLuma(img);
        }
        int[] px = pixels(img);
        int stepX = Math.max(1, (x1 - x0) / 60);
        int stepY = Math.max(1, (y1 - y0) / 60);

        java.util.List<Integer> values = new java.util.ArrayList<>(64 * 64);
        for (int y = y0; y < y1; y += stepY) {
            int row = y * w;
            for (int x = x0; x < x1; x += stepX) {
                int c = px[row + x];
                int r = (c >>> 16) & 0xFF;
                int g = (c >>> 8) & 0xFF;
                int b = c & 0xFF;
                values.add((int) Math.round(0.299 * r + 0.587 * g + 0.114 * b));
            }
        }
        if (values.isEmpty()) {
            return averageLuma(img);
        }
        values.sort(Integer::compareTo);
        return values.get(Math.max(0, values.size() / 10));
    }
}
