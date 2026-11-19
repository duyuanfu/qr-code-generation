package com.qrstudio.gif;

import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assumptions.assumeTrue;

/**
 * 参数可行域扫描（不是回归测试，是调参工具）。
 *
 * <p>只渲染末帧、不编码，单组约 0.2 秒，用来回答「这组参数能不能扫」。
 * 需要真实素材，缺素材时自动跳过。
 *
 * <p>默认禁用：它没有断言，跑完只在日志里打一张可行域表，放进常规套件
 * 只会拖慢 CI 并制造噪声。调参时手动去掉 @Disabled 跑一次。
 */
@Disabled("调参工具，需要人工判读输出")
class GifParamProbeTest {

    @Test
    void scanFeasibleRegion() throws Exception {
        File bgFile = new File("../content.jpg");
        File qrFile = new File("../qr.jpg");
        assumeTrue(bgFile.isFile() && qrFile.isFile(), "缺少测试素材，跳过");

        BufferedImage bg = ImageIO.read(bgFile);
        BufferedImage qr = ImageIO.read(qrFile);
        QrScanVerifier verifier = new QrScanVerifier();
        Path debug = Path.of("target", "gif-probe");
        Files.createDirectories(debug);

        double[][] cases = {
                // halo, opacity, corner, blur
                {0.85, 0.70, 0.85, 0.85},
                {0.88, 0.70, 0.85, 0.85},
                {0.90, 0.70, 0.85, 0.85},
                {0.92, 0.70, 0.85, 0.85},
                {0.90, 0.72, 0.90, 0.85},
                {0.90, 0.75, 0.90, 0.85},
                {0.92, 0.75, 0.90, 0.85},
                {0.85, 0.75, 0.90, 0.85},
                {1.00, 0.70, 0.85, 0.85},
                {1.00, 0.70, 0.90, 0.85},
        };

        for (double[] c : cases) {
            GifOptions o = new GifOptions().normalize();
            o.setHaloAlpha(c[0]);
            o.setQrOpacity(c[1]);
            o.setCornerMult(c[2]);
            o.setBlur(c[3]);

            FrameComposer composer = new FrameComposer(o, bg, qr);
            BufferedImage last = composer.frame(composer.totalFrames() - 1);
            QrScanVerifier.Report r = verifier.verify(last);

            String tag = String.format("halo=%.2f op=%.2f corner=%.2f blur=%.2f", c[0], c[1], c[2], c[3]);
            System.out.println("PROBE " + tag + " -> " + (r.allPass() ? "PASS" : "FAIL")
                    + " [" + r.nativeOk() + "/" + r.size640Ok() + "/" + r.size480Ok() + "]");

            ImageIO.write(last, "png",
                    debug.resolve(String.format("h%.2f_o%.2f_c%.2f_b%.2f.png", c[0], c[1], c[2], c[3])).toFile());
        }
    }
}
