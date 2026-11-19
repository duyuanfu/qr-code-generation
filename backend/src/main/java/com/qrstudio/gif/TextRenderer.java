package com.qrstudio.gif;

import java.awt.*;
import java.awt.font.GlyphVector;
import java.awt.geom.Rectangle2D;
import java.awt.image.BufferedImage;

/**
 * 文字层渲染（brief §2 / §5）。
 *
 * <p>两段文案的样式不同：倒计时是「大字号 + 投影 + 描边」（要压住任何底图），
 * 说明文字是「中字号 + 描边，不要底色块」（brief 明确禁止加底）。
 *
 * <p>用 {@link GlyphVector#getOutline} 而不是 {@code drawString}：只有拿到轮廓
 * 才能同时做「描边 + 填充」，也才能在任意锚点精确对齐。
 */
public final class TextRenderer {

    private TextRenderer() {
    }

    /**
     * 渲染后的文字层。
     *
     * @param image     含 padding 的 ARGB 图
     * @param baselineX 基线在图层内的 x
     * @param baselineY 基线在图层内的 y
     */
    public record Layer(BufferedImage image, int baselineX, int baselineY) {
    }

    /**
     * 渲染一段带描边（可选投影）的文字。
     *
     * @param size        字号（像素）
     * @param strokeWidth 描边宽度，0 表示不描边
     * @param fill        填充色
     * @param stroke      描边色，可为 null
     * @param shadow      投影模糊半径，<=0 表示不加投影
     */
    public static Layer render(String text, float size, float strokeWidth,
                               Color fill, Color stroke, double shadow) {
        Font font = FontRegistry.at(size);

        BufferedImage probe = new BufferedImage(1, 1, BufferedImage.TYPE_INT_ARGB);
        Graphics2D pg = probe.createGraphics();
        pg.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        pg.setFont(font);
        FontMetrics fm = pg.getFontMetrics();
        GlyphVector gv = font.createGlyphVector(pg.getFontRenderContext(), text);
        Rectangle2D bounds = gv.getVisualBounds();
        pg.dispose();

        int pad = (int) Math.ceil(strokeWidth + (shadow > 0 ? shadow * 2 + 4 : 0) + 2);
        int ascent = fm.getAscent();
        int width = (int) Math.ceil(bounds.getWidth()) + pad * 2 + 4;
        int height = (int) Math.ceil(bounds.getHeight()) + pad * 2 + 4;

        // 基线在图层内的位置：outline 以 (baseX, baseY) 为原点绘制
        int baseX = pad - (int) Math.floor(bounds.getX());
        int baseY = pad + ascent;

        BufferedImage layer = ImageOps.newArgb(width, height);
        Graphics2D g = layer.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_STROKE_CONTROL, RenderingHints.VALUE_STROKE_PURE);
        g.setFont(font);

        Shape outline = font.createGlyphVector(g.getFontRenderContext(), text)
                .getOutline(baseX, baseY);

        if (shadow > 0) {
            BufferedImage shadowImg = ImageOps.newArgb(width, height);
            Graphics2D sg = shadowImg.createGraphics();
            sg.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            sg.setColor(new Color(0, 0, 0, 130));
            // brief §2：向 +2px 偏移后模糊，作为落地投影
            sg.translate(2, 2);
            sg.fill(outline);
            sg.dispose();

            BufferedImage blurred = blurArgb(shadowImg, shadow);
            g.drawImage(blurred, 0, 0, null);
        }

        if (stroke != null && strokeWidth > 0) {
            g.setColor(stroke);
            g.setStroke(new BasicStroke(strokeWidth, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));
            g.draw(outline);
        }
        g.setColor(fill);
        g.fill(outline);
        g.dispose();

        return new Layer(layer, baseX, baseY);
    }

    /**
     * 按锚点把文字层贴到画布。
     *
     * @param anchor "lb" 左下 / "mb" 中下
     */
    public static void drawAt(Graphics2D g, Layer layer, String anchor, int x, int y, double alpha) {
        int bx = layer.baselineX();
        int by = layer.baselineY();
        int w = layer.image().getWidth();
        int dx = "mb".equals(anchor) ? x - bx - (w - 2 * 2) / 2 : x - bx;
        int dy = y - by;

        if (alpha >= 0.999) {
            g.drawImage(layer.image(), dx, dy, null);
            return;
        }
        if (alpha <= 0.001) {
            return;
        }
        var old = g.getComposite();
        g.setComposite(AlphaComposite.getInstance(AlphaComposite.SRC_OVER, (float) alpha));
        g.drawImage(layer.image(), dx, dy, null);
        g.setComposite(old);
    }

    private static BufferedImage blurArgb(BufferedImage img, double sigma) {
        int w = img.getWidth();
        int h = img.getHeight();
        float[][] planes = ImageOps.splitArgb(img);
        for (int c = 0; c < 4; c++) {
            planes[c] = FastBlur.gaussian(planes[c], w, h, sigma);
        }
        return ImageOps.mergeArgb(planes, w, h);
    }
}
