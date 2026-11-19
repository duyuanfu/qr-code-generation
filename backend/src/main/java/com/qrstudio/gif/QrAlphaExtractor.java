package com.qrstudio.gif;

import java.awt.image.BufferedImage;

/**
 * 二维码白底转透明（brief §3）。
 *
 * <p>核心是把「白底黑码」的 RGB 图看成一张「黑色的 alpha 图」：
 * {@code alpha = 255 - min(r,g,b)}，白色三通道都是 255 → alpha 0；
 * 黑色 → alpha 255；彩色码（如企微的绿）取最小通道，保证有颜色就有 alpha。
 *
 * <p>关键在反推：直接把 RGB 当颜色用会让半透明边缘发灰（原图在那里是「灰」，
 * 是黑与白的混合，不是真的灰）。正确的做法是从白底里解出原色：
 * {@code rgb = (rgb - 255*(1-a)) / a}。不做这一步，二维码模块边缘会糊成一圈
 * 灰边，扫描器把它当噪声，直接扫不出来。
 */
public final class QrAlphaExtractor {

    private QrAlphaExtractor() {
    }

    /** 把白底二维码转成 RGBA，白色变全透明 */
    public static BufferedImage extract(BufferedImage src) {
        int w = src.getWidth();
        int h = src.getHeight();
        BufferedImage rgbImg = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        var g = rgbImg.createGraphics();
        // 先拍平到白底：源图可能本身带透明通道，直接读会拿到预乘后的怪颜色
        g.setColor(java.awt.Color.WHITE);
        g.fillRect(0, 0, w, h);
        g.drawImage(src, 0, 0, null);
        g.dispose();

        int[] px = ImageOps.pixels(rgbImg);
        BufferedImage out = ImageOps.newArgb(w, h);
        int[] dst = ImageOps.pixels(out);

        for (int i = 0; i < px.length; i++) {
            int c = px[i];
            int r = (c >>> 16) & 0xFF;
            int gg = (c >>> 8) & 0xFF;
            int b = c & 0xFF;
            int min = Math.min(r, Math.min(gg, b));

            int alpha = 255 - min;
            if (alpha <= 0) {
                dst[i] = 0;
                continue;
            }
            double af = alpha / 255.0;
            // 从白底反推原色；af 极小时 rgb 会被放大到无意义，直接置黑
            int rr = af < 1e-6 ? 0 : (int) Math.round((r - 255.0 * (1 - af)) / af);
            int g2 = af < 1e-6 ? 0 : (int) Math.round((gg - 255.0 * (1 - af)) / af);
            int b2 = af < 1e-6 ? 0 : (int) Math.round((b - 255.0 * (1 - af)) / af);
            dst[i] = (alpha << 24)
                    | (clamp(rr) << 16)
                    | (clamp(g2) << 8)
                    | clamp(b2);
        }
        return out;
    }

    private static int clamp(int v) {
        return v < 0 ? 0 : (v > 255 ? 255 : v);
    }
}
