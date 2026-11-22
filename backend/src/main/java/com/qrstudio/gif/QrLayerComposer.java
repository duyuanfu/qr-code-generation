package com.qrstudio.gif;

import java.awt.*;
import java.awt.geom.RoundRectangle2D;
import java.awt.image.BufferedImage;

/**
 * 二维码图层合成（brief §4）。
 *
 * <p>三层结构，顺序不能变：白色柔光衬底 → 二维码本体 → 整体虚化。
 *
 * <p>衬底的存在是为了「白底黑码即便被压到半透明也还能扫」，代价是深色底图上会
 * 出现一块可见的白斑。所以衬底必须羽化成柔光：圆角、高斯羽化、不加投影不加描边。
 * 它的不透明度直接决定「扫得出」与「看不出」的平衡点，因此做成了可调参数。
 */
public final class QrLayerComposer {

    private QrLayerComposer() {
    }

    /**
     * 合成二维码图层（含衬底与虚化），返回一张可直接贴到画布的 ARGB 图。
     *
     * @param qrRgba         已做白底转透明的二维码图
     * @param opts           渲染参数
     * @param resolvedHalo   衬底不透明度（调用方已按底图亮度解析过「自动」）
     */
    public static BufferedImage compose(BufferedImage qrRgba, GifOptions opts, double resolvedHalo) {
        int qrPx = opts.qrPixels();
        int pad = opts.haloPad();
        int haloSize = qrPx + pad * 2;

        BufferedImage halo = buildHalo(haloSize, resolvedHalo, opts.haloFeather());

        BufferedImage body = buildQrBody(qrRgba, qrPx, opts.getQrOpacity(), opts.getCornerMult());

        // 二维码贴在衬底正中
        var g = halo.createGraphics();
        g.setComposite(AlphaComposite.SrcOver);
        g.drawImage(body, pad, pad, null);
        g.dispose();

        return blurLayer(halo, opts.blurRadius());
    }

    /**
     * 白色柔光衬底。
     *
     * <p>只模糊 alpha，RGB 保持纯白。若连 RGB 一起模糊，边缘像素会变成
     * (rgb=128, a=128)，叠在深色底上就是一圈灰边 —— 那正是 brief §4.1
     * 「不允许出现可见矩形边界」要避免的东西。
     *
     * <p>关键细节：模糊必须有「溢出空间」。如果画布和矩形一样大，整张图 alpha
     * 恒为 1，模糊等于没做，边界会是一条刀切的直线。所以先在四周各留
     * {@code 2×feather} 的余量作图，模糊完再把中间裁回来。
     */
    private static BufferedImage buildHalo(int size, double alpha, double feather) {
        int margin = (int) Math.ceil(feather * 2) + 2;
        int work = size + margin * 2;

        BufferedImage img = ImageOps.newArgb(work, work);
        var g = img.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setColor(new Color(255, 255, 255, (int) Math.round(255 * alpha)));
        double arc = size * 0.06;
        g.fill(new RoundRectangle2D.Double(margin, margin, size, size, arc, arc));
        g.dispose();

        float[][] planes = ImageOps.splitArgb(img);
        planes[0] = FastBlur.gaussian(planes[0], work, work, feather);
        // RGB 强制回纯白：模糊后若还留着半透明的「白」，颜色会跟着 alpha 一起衰减变灰
        java.util.Arrays.fill(planes[1], 255f);
        java.util.Arrays.fill(planes[2], 255f);
        java.util.Arrays.fill(planes[3], 255f);
        BufferedImage blurred = ImageOps.mergeArgb(planes, work, work);

        // 裁回目标尺寸。复制而不是 getSubimage：subimage 共享父 buffer，
        // 后续再用 getRaster().getDataBuffer() 读像素会拿到错位的偏移。
        BufferedImage cropped = ImageOps.newArgb(size, size);
        var cg = cropped.createGraphics();
        cg.drawImage(blurred, -margin, -margin, null);
        cg.dispose();
        return cropped;
    }

    /** 二维码本体：缩放 + 四角单独调淡 + 统一不透明度 */
    private static BufferedImage buildQrBody(BufferedImage qrRgba, int qrPx, double opacity, double cornerMult) {
        BufferedImage scaled = ImageOps.resize(qrRgba, qrPx, qrPx);
        int[] px = ImageOps.pixels(scaled);

        // 四角掩膜：定位图案所在的正方形区域，边界做柔化，避免出现硬边
        int box = Math.max(1, (int) Math.round(qrPx * 0.30));
        float[] mask = new float[qrPx * qrPx];
        for (int y = 0; y < qrPx; y++) {
            for (int x = 0; x < qrPx; x++) {
                boolean inCorner = (x < box || x >= qrPx - box) && (y < box || y >= qrPx - box);
                if (inCorner) {
                    mask[y * qrPx + x] = 1f;
                }
            }
        }
        mask = FastBlur.gaussian(mask, qrPx, qrPx, 6.0 * qrPx / 320.0);

        for (int i = 0; i < px.length; i++) {
            int a = (px[i] >>> 24) & 0xFF;
            if (a == 0) {
                continue;
            }
            double factor = opacity * (1 - (1 - cornerMult) * mask[i]);
            int na = (int) Math.round(a * factor);
            px[i] = (na << 24) | (px[i] & 0x00FFFFFF);
        }
        return scaled;
    }

    /**
     * 整层虚化：RGB 与 alpha 分别模糊后合并。
     *
     * <p>brief §4.4 明确禁止预乘/反预乘实现 —— 量化误差会在二维码边缘留下噪点，
     * 实测会导致解码失败。分平面处理在数学上等价，但没有往返转换的精度损失。
     */
    private static BufferedImage blurLayer(BufferedImage layer, double sigma) {
        int w = layer.getWidth();
        int h = layer.getHeight();
        float[][] planes = ImageOps.splitArgb(layer);
        float[] scratch = new float[w * h];
        for (int c = 0; c < 4; c++) {
            planes[c] = FastBlur.gaussian(planes[c], scratch, w, h, sigma);
        }
        return ImageOps.mergeArgb(planes, w, h);
    }

    /**
     * 衬底不透明度的自动值。
     *
     * <p>这是 brief 里唯一一个「写死就必然失败」的参数：0.85 在浅底上刚好，
     * 在深色/饱和底上会让底色透进码区，白衬底被染色、对比度不足。
     * 真实素材上的实测结论比 brief 更保守 —— 二维码底下只要有深色区域，
     * 0.95 都不够，必须 1.0；只有整块都是浅色时才敢降到 0.95。
     */
    public static double autoHaloAlpha(double darkLumaUnderQr) {
        return darkLumaUnderQr < 150 ? 1.00 : 0.95;
    }
}
