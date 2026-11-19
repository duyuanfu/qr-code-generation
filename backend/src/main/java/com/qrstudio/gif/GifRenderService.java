package com.qrstudio.gif;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageOutputStream;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.List;

/**
 * 一次完整的渲染：逐帧合成 → PNG 序列 → ffmpeg 编码 → 抽帧复核。
 *
 * <p>只负责「跑一次」，不管回退、不管体积、不管计费。那些是编排层
 * {@link GifExportService} 的事 —— 回退每级都要重跑这里，把它做成无状态的
 * 纯函数，重试逻辑才不会缠在一起。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class GifRenderService {

    private final FfmpegCli ffmpeg;
    private final QrScanVerifier verifier;

    @Value("${app.upload.dir:data/uploads}")
    private String uploadDirPath;

    /** 一次渲染的结果 */
    public record Outcome(
            int frames,
            long bytes,
            int outputSize,
            QrScanVerifier.Report report,
            int[] qrBox,
            long renderMillis) {
    }

    /** 测试用：绕过 Spring 注入指定上传目录 */
    void setUploadDirPath(String path) {
        this.uploadDirPath = path;
    }

    /**
     * 渲染到指定路径。
     *
     * <p>中间帧落在 {@code {uploadDir}/.gif-tmp/{uuid}}，结束无条件删除：
     * 117 张 800×800 的 PNG 约 30~60MB，漏删几次磁盘就满了。
     */
    public Outcome render(GifOptions opts, BufferedImage background, BufferedImage qrImage, Path outGif)
            throws IOException {
        long start = System.currentTimeMillis();

        Path workDir = Path.of(uploadDirPath, ".gif-tmp", java.util.UUID.randomUUID().toString());
        Files.createDirectories(workDir);
        try {
            FrameComposer composer = new FrameComposer(opts, background, qrImage);
            int total = composer.totalFrames();

            writeFrameSequence(composer, total, workDir);

            Path palette = workDir.resolve("palette.png");
            Files.createDirectories(outGif.toAbsolutePath().getParent());
            ffmpeg.encodeGif(workDir, GifOptions.FPS, palette, outGif);

            long bytes = Files.size(outGif);

            // 校验对象必须是编码后的 GIF：256 色量化与 diff 帧复用都发生在编码阶段
            QrScanVerifier.Report report = verifyEncodedGif(outGif, total, workDir);

            return new Outcome(total, bytes, opts.getOutputSize(), report,
                    composer.qrBoxOnCanvas(), System.currentTimeMillis() - start);
        } finally {
            deleteRecursively(workDir);
        }
    }

    /**
     * 逐帧写 PNG。
     *
     * <p>复用同一个 {@link ImageWriter}：{@code ImageIO.write(img, "png", file)} 每次调用
     * 都要按扩展名反查一遍 writer，117 次重复探测是纯粹的浪费，实测占掉约三成渲染时间。
     */
    private void writeFrameSequence(FrameComposer composer, int total, Path workDir) throws IOException {
        ImageWriter writer = ImageIO.getImageWritersByFormatName("png").next();
        ImageWriteParam param = writer.getDefaultWriteParam();
        if (param.canWriteCompressed()) {
            param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
            // 中间产物，不追求最小体积：低压缩比换来更快的编码
            param.setCompressionQuality(0.5f);
        }
        try {
            for (int i = 0; i < total; i++) {
                BufferedImage frame = composer.frame(i);
                Path file = workDir.resolve(String.format("f%04d.png", i + 1));
                try (ImageOutputStream out = ImageIO.createImageOutputStream(file.toFile())) {
                    writer.setOutput(out);
                    writer.write(null, new IIOImage(frame, null, null), param);
                }
            }
        } finally {
            writer.dispose();
        }
    }

    private QrScanVerifier.Report verifyEncodedGif(Path gif, int total, Path workDir) throws IOException {
        Path checkDir = workDir.resolve("check");
        List<Path> tails = ffmpeg.extractTailFrames(gif, total, 5, checkDir);

        QrScanVerifier.Report worst = null;
        for (Path p : tails) {
            BufferedImage img = ImageIO.read(p.toFile());
            if (img == null) {
                continue;
            }
            QrScanVerifier.Report r = verifier.verify(img);
            if (worst == null || !r.allPass()) {
                worst = r;
            }
            if (r.allPass()) {
                // 末帧一致（虚化全程不变），一帧通过就够了；但保留循环以兼容个别抽帧失败
                return r;
            }
        }
        return worst == null
                ? new QrScanVerifier.Report(false, false, false)
                : worst;
    }

    private void deleteRecursively(Path dir) {
        if (dir == null || !Files.exists(dir)) {
            return;
        }
        try (var walk = Files.walk(dir)) {
            walk.sorted(Comparator.reverseOrder()).forEach(p -> {
                try {
                    Files.deleteIfExists(p);
                } catch (IOException ignored) {
                    // 清理失败不影响交付，交给每日清理任务兜底
                }
            });
        } catch (IOException e) {
            log.warn("临时目录清理失败 {}: {}", dir, e.getMessage());
        }
    }
}
