package com.qrstudio.gif;

import java.awt.*;
import java.awt.image.BufferedImage;
import java.util.HashMap;
import java.util.Map;

/**
 * 逐帧合成器（brief §1 / §6）。
 *
 * <p>三段式时间轴：倒计时 → 淡入 → 常驻。
 *
 * <p>重的部分（底图 cover 裁切、二维码图层含衬底与虚化、文字层）全部在构造时算一次，
 * 每帧只做「贴图 + 设透明度 + 缩放」。这不是微优化 —— 117 帧里每帧都重算一次
 * 13px 羽化的话，单次生成会从 3 秒涨到两分钟。
 *
 * <p>刻意不缓存所有帧：117 张 800×800 的 ARGB 图约 300MB，多来两个并发就 OOM。
 * 每帧渲染完立刻交给编码器写盘。
 */
public class FrameComposer {

    private final GifOptions opts;
    private final int size;

    private final BufferedImage base;
    private final BufferedImage qrLayer;

    /** 文字层缓存：倒计时最多 10 种文案 + 说明 1 种 */
    private final Map<String, TextRenderer.Layer> textCache = new HashMap<>();

    private final int framesCountdown;
    private final int framesFade;
    private final int framesHold;

    public FrameComposer(GifOptions options, BufferedImage background, BufferedImage qrImage) {
        this.opts = options.normalize();
        this.size = opts.getOutputSize();
        this.framesCountdown = opts.framesCountdown();
        this.framesFade = opts.framesFade();
        this.framesHold = opts.framesHold();

        this.base = ImageOps.cover(background, size);

        BufferedImage qrRgba = QrAlphaExtractor.extract(qrImage);

        // 判断衬底该多实，看的是「二维码底下那一块有多暗」，不是整图平均亮度。
        // 平均亮度会把「白底 + 深色主体」的海报误判成浅底，结果衬底只有 0.85，
        // 深色区域透上来把码染绿，实测直接扫不出。
        int qrPx = opts.qrPixels();
        int cx = (int) Math.round(size / 2.0 + opts.getQrOffsetX() * size);
        int cy = (int) Math.round(size / 2.0 + opts.getQrOffsetY() * size);
        double darkLuma = ImageOps.darkLumaIn(base, cx - qrPx / 2, cy - qrPx / 2, qrPx, qrPx);
        double halo = opts.getHaloAlpha() < 0
                ? QrLayerComposer.autoHaloAlpha(darkLuma)
                : opts.getHaloAlpha();
        this.qrLayer = QrLayerComposer.compose(qrRgba, opts, halo);
    }

    public int totalFrames() {
        return framesCountdown + framesFade + framesHold;
    }

    /** 渲染第 index 帧（0 基） */
    public BufferedImage frame(int index) {
        double s = opts.scale();

        BufferedImage canvas = new BufferedImage(size, size, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = canvas.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
        g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);

        g.drawImage(base, 0, 0, null);

        if (index < framesCountdown) {
            // 倒计时段：每 25 帧换一次数字，段内不逐帧递减
            int segment = index / GifOptions.FPS;
            int n = Math.max(1, opts.getWaitSeconds() - segment);
            drawCountdown(g, n, s);
        } else {
            // 淡入段与常驻段共用一套「透明度 + 缩放」曲线
            int local = index - framesCountdown;
            double t = local >= framesFade ? 1.0 : local / (double) framesFade;
            double ease = 1 - Math.pow(1 - t, 2.2);
            double alpha = ease;
            double scale = 0.92 + 0.08 * ease;

            drawQrLayer(g, alpha, scale);
            drawCaption(g, alpha, s);
        }

        g.dispose();
        return canvas;
    }

    private void drawCountdown(Graphics2D g, int n, double s) {
        String text = opts.getCountdownTemplate().replace("{n}", String.valueOf(n));
        TextRenderer.Layer layer = textCache.computeIfAbsent("cd:" + text, k ->
                TextRenderer.render(text,
                        (float) (80 * s),
                        (float) Math.max(2, 5 * s),
                        Color.WHITE,
                        new Color(25, 25, 25, 235),
                        Math.max(1, 4 * s)));
        TextRenderer.drawAt(g, layer, "lb",
                (int) Math.round(52 * s),
                (int) Math.round(size - 46 * s),
                1.0);
    }

    private void drawQrLayer(Graphics2D g, double alpha, double scale) {
        if (alpha <= 0.001) {
            return;
        }
        int full = qrLayer.getWidth();
        int sz = Math.max(2, (int) Math.round(full * scale));
        int cx = (int) Math.round(size / 2.0 + opts.getQrOffsetX() * size);
        int cy = (int) Math.round(size / 2.0 + opts.getQrOffsetY() * size);

        var old = g.getComposite();
        g.setComposite(AlphaComposite.getInstance(AlphaComposite.SRC_OVER, (float) alpha));
        g.drawImage(qrLayer, cx - sz / 2, cy - sz / 2, sz, sz, null);
        g.setComposite(old);
    }

    private void drawCaption(Graphics2D g, double alphaLayer, double s) {
        if (opts.getCaption() == null || opts.getCaption().isBlank()) {
            return;
        }
        // brief §5：说明文字与二维码同步淡入，但比二维码慢半拍，避免抢戏
        double alpha = Math.max(0, Math.min(1, (alphaLayer - 0.05) / 0.6));
        if (alpha <= 0.001) {
            return;
        }
        TextRenderer.Layer layer = textCache.computeIfAbsent("cap:" + opts.getCaption(), k ->
                TextRenderer.render(opts.getCaption(),
                        (float) (40 * s),
                        (float) Math.max(2, 5 * s),
                        Color.WHITE,
                        new Color(30, 30, 30),
                        0));
        TextRenderer.drawAt(g, layer, "mb",
                size / 2,
                (int) Math.round(size - 40 * s),
                alpha);
    }

    /** 二维码图层在画布中的包围盒 [x, y, w, h]，供前端对齐预览 */
    public int[] qrBoxOnCanvas() {
        int full = qrLayer.getWidth();
        int cx = (int) Math.round(size / 2.0 + opts.getQrOffsetX() * size);
        int cy = (int) Math.round(size / 2.0 + opts.getQrOffsetY() * size);
        return new int[]{cx - full / 2, cy - full / 2, full, full};
    }
}
