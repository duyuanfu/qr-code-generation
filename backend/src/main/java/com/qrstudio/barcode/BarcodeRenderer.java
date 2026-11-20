package com.qrstudio.barcode;

import com.google.zxing.common.BitMatrix;
import com.qrstudio.common.BundledFonts;

import javax.imageio.ImageIO;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;

/**
 * 位图渲染。
 *
 * <p>三条硬规则，不给开关：
 * <ul>
 *   <li>画布 {@code TYPE_INT_RGB}，**没有 alpha 通道** —— 透明背景打印出来会变成
 *       「无墨」，落在牛皮纸或彩色标签上是灰底，对比度直接崩；</li>
 *   <li>条恒 {@code #000000}、底恒 {@code #FFFFFF}（对比度 21:1，激光枪最容易读到的取值）；</li>
 *   <li>静区由编码矩阵自带，绘制时不裁切、不覆盖。</li>
 * </ul>
 */
public final class BarcodeRenderer {

    private static final Color BAR = Color.BLACK;
    private static final Color BACKGROUND = Color.WHITE;

    private BarcodeRenderer() {
    }

    /** 导出用：按标签实际毫米尺寸出图，条 + 数字 + 备注 */
    public static BufferedImage renderLabel(BitMatrix bars, BarcodeMetrics metrics, BarcodeSpec spec) {
        int w = metrics.imageWidth();
        int h = metrics.imageHeight();
        BarcodeLayout layout = BarcodeLayout.of(w, h, bars.getWidth(), spec.showText(), !spec.caption().isEmpty());

        BufferedImage img = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = img.createGraphics();
        try {
            g.setColor(BACKGROUND);
            g.fillRect(0, 0, w, h);
            // 只给文字开抗锯齿；条是整数坐标的 fillRect，不受影响，边缘仍是硬边
            g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
            g.setColor(BAR);
            drawBars(g, bars, layout.barLeft(), layout.barTop(), layout.barHeight());
            if (spec.showText()) {
                drawHri(g, layout, metrics, spec);
            }
        } finally {
            g.dispose();
        }
        return img;
    }

    /**
     * 预览用：每模块 1 像素。
     *
     * <p>不画数字：1px 的模块宽度下文字没有意义，放大后也只是一团灰。
     * 预览的职责是「结构对不对」，不是「好不好看」。
     */
    public static BufferedImage renderPreview(BitMatrix bars) {
        int w = bars.getWidth();
        int h = bars.getHeight();
        BufferedImage img = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = img.createGraphics();
        try {
            g.setColor(BACKGROUND);
            g.fillRect(0, 0, w, h);
            g.setColor(BAR);
            drawBars(g, bars, 0, 0, h);
        } finally {
            g.dispose();
        }
        return img;
    }

    /**
     * 画条。
     *
     * <p>一维码所有行完全相同，所以在第 0 行上求一次游程，每个游程画一根通高的矩形，
     * 比逐像素判断快两个数量级（468×218 的图上少做十万次分支）。
     */
    private static void drawBars(Graphics2D g, BitMatrix bars, int x0, int y0, int height) {
        int w = bars.getWidth();
        int runStart = -1;
        for (int x = 0; x <= w; x++) {
            boolean on = x < w && bars.get(x, 0);
            if (on && runStart < 0) {
                runStart = x;
            } else if (!on && runStart >= 0) {
                g.fillRect(x0 + runStart, y0, x - runStart, height);
                runStart = -1;
            }
        }
    }

    /**
     * 人眼可读数字（HRI）+ 可选备注。
     *
     * <p>不实现 EAN 标准那套「1 + 6 + 6 分组、首位落在左侧静区外、guard bar 下延」的排布：
     * 对人工核对的增益很小，却要在窄标签上逐字定位，溢出风险高。统一居中一行，
     * 超宽先缩字号，缩到下限仍超就按可用宽度截断。
     */
    private static void drawHri(Graphics2D g, BarcodeLayout layout, BarcodeMetrics metrics, BarcodeSpec spec) {
        String digits = metrics.normalizedContent();
        String caption = spec.caption();
        int areaTop = layout.barTop() + layout.barHeight();
        int areaHeight = layout.textArea();
        int maxWidth = (int) (layout.canvasW() * 0.94);
        int centerX = layout.canvasW() / 2;

        if (caption.isEmpty()) {
            drawFittedLine(g, digits, centerX, areaTop, areaHeight, areaHeight * 0.70, maxWidth);
            return;
        }
        // 有备注时把文字区分成上下两段：数字占 58%，备注占 42%
        int digitArea = (int) Math.round(areaHeight * 0.58);
        drawFittedLine(g, digits, centerX, areaTop, digitArea, digitArea * 0.80, maxWidth);
        drawFittedLine(g, caption, centerX, areaTop + digitArea, areaHeight - digitArea,
                (areaHeight - digitArea) * 0.86, maxWidth);
    }

    /** 在指定区域（顶部 top，高 height）内水平居中、垂直居中画一行字 */
    private static void drawFittedLine(Graphics2D g, String text, int centerX, int top, int height,
                                       double preferredSize, int maxWidth) {
        if (text == null || text.isEmpty() || height <= 2) {
            return;
        }
        float size = Math.max(5f, (float) preferredSize);
        Font font = BundledFonts.at(size);
        FontMetrics fm = g.getFontMetrics(font);

        while (fm.stringWidth(text) > maxWidth && size > 5f) {
            size -= Math.max(0.5f, size * 0.06f);
            font = BundledFonts.at(size);
            fm = g.getFontMetrics(font);
        }
        String line = text;
        while (line.length() > 1 && fm.stringWidth(line) > maxWidth) {
            line = line.substring(0, line.length() - 1);
        }

        g.setFont(font);
        int baseline = top + (height - (fm.getAscent() + fm.getDescent())) / 2 + fm.getAscent();
        g.drawString(line, centerX - fm.stringWidth(line) / 2, baseline);
    }

    public static byte[] toPng(BufferedImage img) {
        try (ByteArrayOutputStream out = new ByteArrayOutputStream(64 * 1024)) {
            ImageIO.write(img, "png", out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new BarcodeException(500, "PNG 编码失败：" + e.getMessage());
        }
    }
}
