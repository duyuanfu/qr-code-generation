package com.qrstudio.barcode;

import com.google.zxing.common.BitMatrix;
import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;

import java.awt.image.BufferedImage;

/**
 * 调参探针：劣化档的缩放系数取多少，才能「拦住 2px 模块、放过 3px 模块」。
 * 结论写在 {@link BarcodeVerifier#DEGRADE_SCALE} 的注释里，本文件默认不跑。
 */
class BarcodeDegradeProbeTest {

    private record Case(String sym, String text, BufferedImage img) {
    }

    private static Case render(String sym, String content) {
        BarcodeOptions o = new BarcodeOptions();
        o.setSymbology(sym);
        o.setContent(content);
        o.setLabelWidthMm(40.0);
        o.setLabelHeightMm(25.0);
        o.setDpi(300);
        BarcodeSpec spec = o.normalize();
        BarcodeContent.Prepared p = BarcodeContent.prepare(spec.symbology(), spec.content());
        BitMatrix measure = BarcodeEncoder.measure(spec.symbology(), p.text());
        BarcodeMetrics m = BarcodeMetrics.compute(spec, p, measure.getWidth());
        BarcodeLayout layout = BarcodeLayout.of(m.imageWidth(), m.imageHeight(), measure.getWidth(),
                spec.showText(), !spec.caption().isEmpty());
        BitMatrix bars = BarcodeEncoder.write(spec.symbology(), p.text(),
                m.totalModules() * m.modulePx(), layout.barHeight());
        return new Case(sym, p.text(), BarcodeRenderer.renderLabel(bars, m, spec));
    }

    @Disabled("调参工具，不进 CI：改动 DEGRADE_SCALE 时手动跑一次看四个档位的通过情况")
    @Test
    void probe() {
        Case[] cases = {
                render("EAN_13", "690123456789"),   // 4px
                render("CODE_39", "AB-123"),        // 3px
                render("CODE_128", "SKU-2026/A01"), // 2px
        };
        for (double scale : new double[]{0.5, 0.55, 0.6, 0.65, 0.7}) {
            StringBuilder line = new StringBuilder("scale=" + scale + "  ");
            for (Case c : cases) {
                BarcodeVerifier.Report r = BarcodeVerifier.verify(
                        c.img(), BarcodeSymbology.parse(c.sym()), c.text(), scale);
                line.append(c.sym()).append("=").append(r.degradedOk() ? "PASS" : "fail").append("  ");
            }
            System.out.println(line);
        }
    }
}
