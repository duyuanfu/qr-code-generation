package com.qrstudio.barcode;

import com.google.zxing.common.BitMatrix;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 尺寸推导的回归测试。
 *
 * <p>核心不变量：{@code modulePx} 必须是整数，且报出去的毫米数必须与它自洽 ——
 * 这两条一旦破了，打出来的条宽比例就是错的，而人眼看不出来。
 */
class BarcodeMetricsTest {

    private static BarcodeSpec spec(String symbology, String content, double wMm, double hMm, int dpi) {
        BarcodeOptions o = new BarcodeOptions();
        o.setSymbology(symbology);
        o.setContent(content);
        o.setLabelWidthMm(wMm);
        o.setLabelHeightMm(hMm);
        o.setDpi(dpi);
        return o.normalize();
    }

    private static BarcodeMetrics metrics(BarcodeSpec spec) {
        BarcodeContent.Prepared p = BarcodeContent.prepare(spec.symbology(), spec.content());
        BitMatrix m = BarcodeEncoder.measure(spec.symbology(), p.text());
        return BarcodeMetrics.compute(spec, p, m.getWidth());
    }

    @Test
    void ean13At40mm300dpiMatchesTheDesignTable() {
        BarcodeMetrics m = metrics(spec("EAN_13", "690123456789", 40, 25, 300));
        assertEquals(117, m.totalModules(), "EAN-13 = 95 符号模块 + 两侧各 11 静区");
        assertEquals(4, m.modulePx());
        assertEquals(0.3387, m.xMm(), 1e-4);
        assertEquals(1.0263, m.magnification(), 1e-4);
        assertEquals(39.62, m.widthMm(), 0.01);
        assertEquals("6901234567892", m.normalizedContent());
        assertTrue(m.checksumAppended());
        assertTrue(m.warnings().isEmpty(), String.join("; ", m.warnings()));
    }

    @Test
    void modulePixelCountIsAlwaysAnIntegerAndConsistentWithReportedWidth() {
        for (int dpi : new int[]{203, 300, 600}) {
            for (double width : new double[]{30, 40, 50, 60, 80}) {
                BarcodeMetrics m;
                try {
                    m = metrics(spec("EAN_13", "690123456789", width, 25, dpi));
                } catch (BarcodeException e) {
                    // 超出标准倍率区间的组合会被拒绝，那是另一条测试的事；
                    // 这里只验证「算得出来的那些」自洽。
                    assertEquals(400, e.getCode());
                    continue;
                }
                assertEquals(m.modulePx(), m.totalModules() * m.modulePx() / m.totalModules());
                assertEquals(m.totalModules() * m.modulePx() * 25.4 / dpi, m.widthMm(), 0.01);
                assertTrue(m.modulePx() >= 1);
            }
        }
    }

    @Test
    void tooNarrowLabelIsRejectedWithAFeasibleWidthRange() {
        BarcodeException e = assertThrows(BarcodeException.class,
                () -> metrics(spec("EAN_13", "690123456789", 20, 25, 300)));
        assertEquals(400, e.getCode());
        assertTrue(e.getMessage().contains("标签宽度"), e.getMessage());
        assertTrue(e.getMessage().contains("39.6"), e.getMessage());
        assertTrue(e.getMessage().contains("79.1"), e.getMessage());
    }

    @Test
    void magnificationFarFromNominalProducesANonBlockingWarning() {
        BarcodeMetrics m = metrics(spec("EAN_13", "690123456789", 50, 25, 300));
        assertEquals(5, m.modulePx());
        assertTrue(m.magnification() > 1.2);
        assertTrue(m.warnings().stream().anyMatch(w -> w.contains("放大倍率")), m.warnings().toString());
    }

    @Test
    void tinyModuleWidthWarnsAboutPrintability() {
        // Code 128 没有强制倍率区间，长内容挤在窄标签上会掉到每模块 1 像素：
        // 这种组合不会 400，但必须给出「印出来读不出」的警告
        BarcodeMetrics m = metrics(spec("CODE_128", "12345678901234567890", 40, 25, 203));
        assertEquals(1, m.modulePx());
        assertTrue(m.warnings().stream().anyMatch(w -> w.contains("像素")), m.warnings().toString());
    }

    @Test
    void ean8AndUpcAHaveTheirOwnModuleCounts() {
        assertEquals(81, metrics(spec("EAN_8", "6901234", 30, 20, 300)).totalModules());
        assertEquals(113, metrics(spec("UPC_A", "01234567890", 40, 25, 300)).totalModules());
    }

    @Test
    void code128ModuleCountFollowsTheContent() {
        BarcodeMetrics shortCode = metrics(spec("CODE_128", "1234", 40, 25, 300));
        BarcodeMetrics longCode = metrics(spec("CODE_128", "1234567890123456", 40, 25, 300));
        assertTrue(longCode.totalModules() > shortCode.totalModules());
        assertTrue(shortCode.totalModules() >= 20, "至少要有起止符与静区");
    }

    @Test
    void invalidNumericParametersAreRejected() {
        assertThrows(BarcodeException.class, () -> spec("EAN_13", "690123456789", 10, 25, 300));
        assertThrows(BarcodeException.class, () -> spec("EAN_13", "690123456789", 40, 5, 300));
        assertThrows(BarcodeException.class, () -> spec("EAN_13", "690123456789", 40, 25, 150));
    }

    @Test
    void captionIsTruncatedNotRejected() {
        BarcodeOptions o = new BarcodeOptions();
        o.setSymbology("EAN_13");
        o.setContent("690123456789");
        o.setCaption("商".repeat(60));
        assertEquals(40, o.normalize().caption().length());
    }
}
