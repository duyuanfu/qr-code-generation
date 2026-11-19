package com.qrstudio.gif;

import org.junit.jupiter.api.Test;

import java.awt.*;
import java.awt.image.BufferedImage;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 白底转透明是整条链路里最容易「看起来对、扫不出」的一步，
 * 单独把它钉死：白色必须全透明，半透明边缘必须反推出原色而不是留灰。
 */
class QrAlphaExtractorTest {

    private static BufferedImage whiteWithBars() {
        int w = 60;
        int h = 60;
        BufferedImage img = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = img.createGraphics();
        g.setColor(Color.WHITE);
        g.fillRect(0, 0, w, h);
        g.setColor(Color.BLACK);
        g.fillRect(20, 20, 20, 20);
        // 半透明边缘：灰 128 等价于「50% 的黑压在白上」
        g.setColor(new Color(128, 128, 128));
        g.fillRect(20, 45, 20, 5);
        g.dispose();
        return img;
    }

    @Test
    void whiteBecomesFullyTransparent() {
        BufferedImage out = QrAlphaExtractor.extract(whiteWithBars());
        assertEquals(0, alphaAt(out, 2, 2), "纯白必须 alpha=0");
        assertEquals(0, alphaAt(out, 58, 2));
    }

    @Test
    void blackStaysOpaqueAndBlack() {
        BufferedImage out = QrAlphaExtractor.extract(whiteWithBars());
        int rgb = out.getRGB(30, 30);
        assertEquals(255, (rgb >>> 24) & 0xFF, "纯黑必须全不透明");
        assertEquals(0, (rgb >>> 16) & 0xFF, "纯黑反推后仍是纯黑");
    }

    /**
     * 关键用例：中灰像素的 RGB 必须被反推回接近黑。
     *
     * <p>不做反推的话，这里会留下 rgb=(128,128,128) 的灰模块 —— 叠到深色底图上
     * 就是一片糊掉的灰斑，扫描器直接当噪声丢掉。
     */
    @Test
    void greyEdgeIsUnPremultipliedToBlack() {
        BufferedImage out = QrAlphaExtractor.extract(whiteWithBars());
        int rgb = out.getRGB(30, 47);
        int a = (rgb >>> 24) & 0xFF;
        int r = (rgb >>> 16) & 0xFF;

        assertTrue(a > 100 && a < 160, "中灰应得到约一半的 alpha，实际 " + a);
        assertTrue(r < 20, "反推后的 RGB 必须接近黑，实际 " + r);
    }

    private static int alphaAt(BufferedImage img, int x, int y) {
        return (img.getRGB(x, y) >>> 24) & 0xFF;
    }
}
