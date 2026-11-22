package com.qrstudio.gif;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.MultiFormatWriter;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;
import org.junit.jupiter.api.Test;

import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.EnumMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 「去掉二维码中间的产品图案」。
 *
 * <p>核心断言有两条，缺一不可：重绘后的图**内容不变**（不能把码画坏），
 * 且**不再有彩色像素**（图案真的没了）。第一条用 ZXing 解一遍来验，
 * 第二条按 RGB 三通道是否相等来判断 —— 纯黑纯白都是灰度。
 */
class QrCleanerTest {

    private static final String CONTENT = "https://qr.trythis.pw/gif?id=logo-test";

    @Test
    void redrawsTheSameContentWithoutTheCenterLogo() throws Exception {
        Path dir = Files.createTempDirectory("qr-clean-");
        Path src = dir.resolve("src.png");
        ImageIO.write(withCenterLogo(CONTENT), "png", src.toFile());

        // 前提：这张带图案的码本身还得能解出来，否则测的就不是「去除」而是「识别失败」
        QrScanVerifier verifier = new QrScanVerifier();
        assertEquals(CONTENT, verifier.decode(ImageIO.read(src.toFile())), "测试素材本身应可解");

        QrCleaner cleaner = new QrCleaner(verifier);
        cleaner.setUploadDirPath(dir.toString());
        QrCleaner.Cleaned cleaned = cleaner.clean("/uploads/src.png");

        assertEquals(CONTENT, cleaned.content());
        assertTrue(cleaned.url().startsWith("/uploads/"));

        Path out = dir.resolve(Path.of(cleaned.url()).getFileName().toString());
        assertTrue(Files.isRegularFile(out), "重绘结果应落盘");

        BufferedImage clean = ImageIO.read(out.toFile());
        assertNotNull(clean);
        assertEquals(1024, clean.getWidth());
        assertFalse(hasColorfulPixel(clean), "重绘后不应再有彩色图案");
        assertEquals(CONTENT, verifier.decode(clean), "重绘结果必须仍然可解");
    }

    @Test
    void sameContentProducesTheSameFile() throws Exception {
        Path dir = Files.createTempDirectory("qr-clean-dedupe-");
        Files.copy(writeSource(dir), dir.resolve("again.png"));

        QrCleaner cleaner = new QrCleaner(new QrScanVerifier());
        cleaner.setUploadDirPath(dir.toString());
        String first = cleaner.clean("/uploads/src.png").url();
        String second = cleaner.clean("/uploads/again.png").url();

        assertEquals(first, second, "同一张码两次重绘应命中同一份文件（内容寻址）");
    }

    @Test
    void rejectsImagesThatAreNotDecodable() throws Exception {
        Path dir = Files.createTempDirectory("qr-clean-bad-");
        BufferedImage noise = new BufferedImage(320, 320, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = noise.createGraphics();
        g.setColor(new Color(200, 120, 40));
        g.fillRect(0, 0, 320, 320);
        g.dispose();
        ImageIO.write(noise, "png", dir.resolve("noise.png").toFile());

        QrCleaner cleaner = new QrCleaner(new QrScanVerifier());
        cleaner.setUploadDirPath(dir.toString());

        GifException e = assertThrows(GifException.class, () -> cleaner.clean("/uploads/noise.png"));
        assertEquals(400, e.getCode());
        assertTrue(e.getMessage().contains("识别不出来"), "应告诉用户「识别不出来」而不是含糊报错");
    }

    private Path writeSource(Path dir) throws Exception {
        Path src = dir.resolve("src.png");
        ImageIO.write(withCenterLogo(CONTENT), "png", src.toFile());
        return src;
    }

    /** 造一张「中间贴了产品图案」的二维码：1024 画布上一个占 18% 边长的圆角色块 */
    private BufferedImage withCenterLogo(String content) throws Exception {
        int size = 1024;
        Map<EncodeHintType, Object> hints = new EnumMap<>(EncodeHintType.class);
        hints.put(EncodeHintType.CHARACTER_SET, "UTF-8");
        hints.put(EncodeHintType.ERROR_CORRECTION, ErrorCorrectionLevel.H);
        hints.put(EncodeHintType.MARGIN, 4);
        BitMatrix matrix = new MultiFormatWriter()
                .encode(content, BarcodeFormat.QR_CODE, size, size, hints);

        BufferedImage img = new BufferedImage(size, size, BufferedImage.TYPE_INT_RGB);
        for (int y = 0; y < size; y++) {
            for (int x = 0; x < size; x++) {
                img.setRGB(x, y, matrix.get(x, y) ? 0x000000 : 0xFFFFFF);
            }
        }

        Graphics2D g = img.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        int box = (int) Math.round(size * 0.18);
        int at = (size - box) / 2;
        // 白色圆角托底 + 橙色图案，模拟真实产品 logo
        g.setColor(Color.WHITE);
        g.fillRoundRect(at - 8, at - 8, box + 16, box + 16, 24, 24);
        g.setColor(new Color(240, 120, 30));
        g.fillRoundRect(at, at, box, box, 18, 18);
        g.setColor(Color.WHITE);
        g.fillOval(at + box / 3, at + box / 3, box / 3, box / 3);
        g.dispose();
        return img;
    }

    /** 纯黑/纯白/灰阶都算「无彩色」；只要出现一个 R≠G≠B 的像素就判有图案 */
    private boolean hasColorfulPixel(BufferedImage img) {
        int w = img.getWidth();
        int h = img.getHeight();
        int[] px = new int[w * h];
        img.getRGB(0, 0, w, h, px, 0, w);
        for (int c : px) {
            int r = (c >>> 16) & 0xFF;
            int g = (c >>> 8) & 0xFF;
            int b = c & 0xFF;
            if (Math.abs(r - g) > 6 || Math.abs(g - b) > 6) {
                return true;
            }
        }
        return false;
    }
}
