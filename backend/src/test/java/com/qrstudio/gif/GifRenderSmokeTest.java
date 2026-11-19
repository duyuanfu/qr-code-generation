package com.qrstudio.gif;

import org.junit.jupiter.api.Test;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/**
 * 真实素材上的端到端冒烟：渲染 → 编码 → 抽帧 → 解码。
 *
 * <p>不做参数化的细粒度断言（那是单元测试的事），只回答一个问题：
 * 「用仓库里的 content.jpg + qr.jpg 跑默认参数，能不能产出可扫的 GIF」。
 * 没有 ffmpeg 或素材缺失时跳过，不让 CI 因环境问题红掉。
 */
class GifRenderSmokeTest {

    @Test
    void rendersScannableGifWithDefaultOptions() throws Exception {
        File bg = new File("../content.jpg");
        File qr = new File("../qr.jpg");
        assumeTrue(bg.isFile() && qr.isFile(), "缺少测试素材 content.jpg / qr.jpg，跳过");

        FfmpegCli ffmpeg = new FfmpegCli();
        assumeTrue(ffmpeg.version() != null, "本机没有 ffmpeg，跳过");

        Path work = Files.createTempDirectory("gif-smoke-");
        try {
            GifRenderService render = new GifRenderService(ffmpeg, new QrScanVerifier());
            render.setUploadDirPath(work.toString());

            GifOptions opts = new GifOptions().normalize();
            BufferedImage bgImg = ImageIO.read(bg);
            BufferedImage qrImg = ImageIO.read(qr);

            Path out = work.resolve("out.gif");
            GifRenderService.Outcome result = render.render(opts, bgImg, qrImg, out);

            // 失败时把产物留下来，方便人工看末帧
            Path debugDir = Path.of("target", "gif-debug");
            Files.createDirectories(debugDir);
            Files.copy(out, debugDir.resolve("out.gif"),
                    java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            new FfmpegCli().extractTailFrames(out, result.frames(), 1, debugDir.resolve("frame"));

            // 对照：渲染末帧直接存 PNG，与 GIF 抽帧比较，区分「渲染问题」与「量化问题」
            FrameComposer probe = new FrameComposer(opts, bgImg, qrImg);
            BufferedImage lastFrame = probe.frame(probe.totalFrames() - 1);
            ImageIO.write(lastFrame, "png", debugDir.resolve("last-frame.png").toFile());
            QrScanVerifier verifier = new QrScanVerifier();
            System.out.println("PNG_VERIFY=" + verifier.verify(lastFrame)
                    + " qrBox=" + java.util.Arrays.toString(probe.qrBoxOnCanvas()));
            System.out.println("DEBUG GIF -> " + debugDir.toAbsolutePath());

            System.out.println("frames=" + result.frames()
                    + " size=" + result.outputSize()
                    + " bytes=" + result.bytes()
                    + " report=" + result.report()
                    + " ms=" + result.renderMillis());

            assertEquals(117, result.frames());
            assertEquals(800, result.outputSize());
            assertTrue(result.bytes() > 300_000, "体积过小，可能只写了个空壳");
            assertTrue(result.bytes() < 5L * 1024 * 1024, "体积超出可用范围");
            assertTrue(result.report().allPass(), "默认参数下二维码应可被识别: " + result.report().reason());
        } finally {
            try (var walk = Files.walk(work)) {
                walk.sorted(java.util.Comparator.reverseOrder()).forEach(p -> p.toFile().delete());
            }
        }
    }
}
