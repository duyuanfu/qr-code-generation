package com.qrstudio.gif;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;

import java.awt.Color;
import java.awt.GradientPaint;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.util.EnumMap;
import java.util.Map;

/**
 * 测试素材工厂。
 *
 * <p>原来那两个 GIF 测试读仓库根目录的 {@code content.jpg} / {@code qr.jpg}，
 * 素材被删掉之后它们永远走 {@code assumeTrue} 静默跳过 —— 覆盖等于零，而
 * 「长得像回归测试、实际从不执行」比没有测试更危险。改成现场合成：
 * 背景是一张深色渐变 + 中段更暗的色块（模拟真实海报里二维码压在深色衣服上），
 * 二维码用 ZXing 直接编码成白底黑码。
 *
 * <p>合成的图可控、可复现、零外部依赖，CI 只需有 ffmpeg。
 */
final class GifTestImages {

    private GifTestImages() {
    }

    /** 合成海报底图：对角渐变 + 中间一块更暗的矩形 */
    static BufferedImage poster(int size) {
        BufferedImage img = new BufferedImage(size, size, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = img.createGraphics();
        g.setPaint(new GradientPaint(0, 0, new Color(38, 52, 82), size, size, new Color(12, 16, 26)));
        g.fillRect(0, 0, size, size);
        // 二维码落在画布中心偏上，这里正好把它压在深色块里，衬底逻辑才会真正起作用
        g.setColor(new Color(10, 10, 12));
        g.fillRect(size / 5, size / 6, size * 3 / 5, size * 2 / 5);
        g.dispose();
        return img;
    }

    /** 合成二维码图：白底黑码，可直接被 {@link QrAlphaExtractor} 处理 */
    static BufferedImage qr(String content, int px) {
        Map<EncodeHintType, Object> hints = new EnumMap<>(EncodeHintType.class);
        hints.put(EncodeHintType.MARGIN, 2);
        hints.put(EncodeHintType.ERROR_CORRECTION, ErrorCorrectionLevel.M);
        BitMatrix matrix;
        try {
            matrix = new QRCodeWriter().encode(content, BarcodeFormat.QR_CODE, px, px, hints);
        } catch (Exception e) {
            throw new IllegalStateException("合成二维码失败", e);
        }

        BufferedImage img = new BufferedImage(px, px, BufferedImage.TYPE_INT_RGB);
        for (int y = 0; y < px; y++) {
            for (int x = 0; x < px; x++) {
                img.setRGB(x, y, matrix.get(x, y) ? 0xFF000000 : 0xFFFFFFFF);
            }
        }
        return img;
    }

    static final String SAMPLE_URL = "https://example.com/gif-smoke";
}
