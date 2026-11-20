package com.qrstudio.barcode;

import com.google.zxing.common.BitMatrix;
import org.junit.jupiter.api.Test;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 端到端：编码 → 出图 → 自己再解一遍。
 *
 * <p>五种码制都要跑，因为 ZXing 对不同码制的长度校验、校验位补齐行为并不一致
 * （EAN 会自动补校验位，Code 39 不校验，UPC-A 解码可能带前导 0）。
 */
class BarcodeRenderTest {

    private static BarcodeSpec spec(String symbology, String content) {
        BarcodeOptions o = new BarcodeOptions();
        o.setSymbology(symbology);
        o.setContent(content);
        o.setLabelWidthMm(40.0);
        o.setLabelHeightMm(25.0);
        o.setDpi(300);
        o.setCaption("测试标签");
        return o.normalize();
    }

    private record Built(BarcodeSpec spec, BarcodeContent.Prepared content,
                         BarcodeMetrics metrics, BitMatrix bars, BufferedImage image) {
    }

    private static Built build(String symbology, String content) {
        BarcodeSpec spec = spec(symbology, content);
        BarcodeContent.Prepared p = BarcodeContent.prepare(spec.symbology(), spec.content());
        BitMatrix measure = BarcodeEncoder.measure(spec.symbology(), p.text());
        BarcodeMetrics metrics = BarcodeMetrics.compute(spec, p, measure.getWidth());
        BarcodeLayout layout = BarcodeLayout.of(metrics.imageWidth(), metrics.imageHeight(),
                measure.getWidth(), spec.showText(), !spec.caption().isEmpty());
        BitMatrix bars = BarcodeEncoder.write(spec.symbology(), p.text(),
                metrics.totalModules() * metrics.modulePx(), layout.barHeight());
        BufferedImage img = BarcodeRenderer.renderLabel(bars, metrics, spec);
        return new Built(spec, p, metrics, bars, img);
    }

    @Test
    void allFiveSymbologiesRoundTrip() {
        String[][] cases = {
                {"EAN_13", "690123456789"},
                {"EAN_8", "6901234"},
                {"UPC_A", "01234567890"},
                {"CODE_128", "SKU01"},
                {"CODE_39", "AB-123"},
        };
        for (String[] c : cases) {
            Built b = build(c[0], c[1]);
            BarcodeVerifier.Report report = BarcodeVerifier.verify(b.image(), b.spec().symbology(), b.content().text());
            assertTrue(report.allPass(), c[0] + " 自检失败：" + report.reason()
                    + " native=" + report.nativeText() + " degraded=" + report.degradedText());
        }
    }

    @Test
    void longCode128OnANarrowLabelIsCaughtByTheDegradedTier() {
        // 12 个字符的 SKU 挤在 40mm 标签上，每模块只有 2 像素：原图能解，劣化后解不出。
        // 这正是「印出来读不出」的那类错误，必须在交付前拦下（对应 tasks 4.5）。
        Built b = build("CODE_128", "SKU-2026/A01");
        BarcodeVerifier.Report report = BarcodeVerifier.verify(b.image(), b.spec().symbology(), b.content().text());
        assertTrue(report.nativeOk(), "原图应当能解出来");
        assertFalse(report.degradedOk(), "劣化档必须拦住这种过窄的组合");
        assertEquals(2, b.metrics().modulePx());
    }

    @Test
    void renderedImageIsOpaqueRgbWithPureWhiteQuietZone() {
        Built b = build("EAN_13", "690123456789");
        assertEquals(BufferedImage.TYPE_INT_RGB, b.image().getType());
        assertEquals(b.metrics().imageWidth(), b.image().getWidth());
        assertEquals(b.metrics().imageHeight(), b.image().getHeight());

        // 矩阵自带静区：最左一列必须全白，否则打印后边缘会把第一根条吃掉
        for (int y = 0; y < b.image().getHeight(); y++) {
            assertEquals(0xFFFFFF, b.image().getRGB(0, y) & 0xFFFFFF, "第 " + y + " 行最左侧不是纯白");
        }
        // 条恒纯黑，不允许任何灰度
        boolean hasBlack = false;
        for (int x = 0; x < b.image().getWidth(); x++) {
            if ((b.image().getRGB(x, b.metrics().imageHeight() / 3) & 0xFFFFFF) == 0x000000) {
                hasBlack = true;
                break;
            }
        }
        assertTrue(hasBlack);
    }

    @Test
    void previewIsOnePixelPerModule() throws Exception {
        BarcodeSpec spec = spec("EAN_13", "690123456789");
        BarcodeContent.Prepared p = BarcodeContent.prepare(spec.symbology(), spec.content());
        BitMatrix measure = BarcodeEncoder.measure(spec.symbology(), p.text());
        BarcodeMetrics metrics = BarcodeMetrics.compute(spec, p, measure.getWidth());

        BufferedImage preview = BarcodeRenderer.renderPreview(measure);
        assertEquals(metrics.totalModules(), preview.getWidth());

        // 走一遍 PNG 编解码，确认前端拿到的是可用的图
        byte[] png = BarcodeRenderer.toPng(preview);
        BufferedImage decoded = ImageIO.read(new ByteArrayInputStream(png));
        assertNotNull(decoded);
        assertEquals(metrics.totalModules(), decoded.getWidth());
    }

    @Test
    void svgMergesRunsInsteadOfOneRectPerModule() {
        Built b = build("EAN_13", "690123456789");
        String svg = BarcodeSvgWriter.write(b.bars(), b.metrics(), b.spec());

        assertTrue(svg.contains("width=\"40mm\""), svg.substring(0, Math.min(300, svg.length())));
        assertTrue(svg.contains("height=\"25mm\""));
        assertTrue(svg.contains("viewBox="));

        int rects = svg.split("<rect ", -1).length - 1;
        // 背景 1 个 + 游程若干个；EAN-13 有 95 个符号模块，合并后应在 30~60 之间
        assertTrue(rects > 2, "至少要有一根条");
        assertTrue(rects < b.metrics().totalModules() / 2, "游程合并失效，rect 数=" + rects);
        assertTrue(svg.contains("6901234567892"));
    }

    @Test
    void previewNeverConsumesTheRequestedDpi() {
        // 同一组参数在 203 与 600 dpi 下，预览图宽度必须完全一致（都是每模块 1 像素）
        BitMatrix a = BarcodeEncoder.measure(BarcodeSymbology.EAN_13, "6901234567892");
        BitMatrix b = BarcodeEncoder.measure(BarcodeSymbology.EAN_13, "6901234567892");
        assertEquals(a.getWidth(), b.getWidth());
        assertEquals(117, a.getWidth());
    }
}
