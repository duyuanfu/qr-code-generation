package com.qrstudio.gif;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * ffmpeg 命令行封装。
 *
 * <p>只做三件事：两遍 GIF 编码、从成品 GIF 抽帧、探测可用性。
 *
 * <p>输出重定向到临时文件而不是管道：ffmpeg 的 stderr 在失败时会刷出几十 KB 的
 * 编解码日志，用 {@code Process.getInputStream()} 同步读容易在缓冲区满时和
 * {@code waitFor} 互相卡死，落盘再读没有这个风险。
 */
@Slf4j
@Component
public class FfmpegCli {

    /** 默认走 PATH；容器里由 apt 装到 /usr/bin/ffmpeg */
    @Value("${app.gif.ffmpeg:ffmpeg}")
    private String ffmpegPath = "ffmpeg";

    /** 调色板与编码超时；800×800/117 帧实测各 1~2s，给足余量 */
    private static final long TIMEOUT_SECONDS = 90;

    /** 测试与本地脚本用：跳过 Spring 注入直接指定可执行文件 */
    void setFfmpegPath(String path) {
        this.ffmpegPath = path;
    }

    /** 当前配置的可执行文件名/路径，用于诊断接口回显 */
    public String configuredPath() {
        return ffmpegPath;
    }

    /**
     * 探测结果缓存。
     *
     * <p>只缓存「成功」：失败不缓存，这样管理员装好 ffmpeg 之后即使不重启也能在下次请求恢复
     * （要等到重启才生效的话，用户看到的现象是「装完了还是不行」，只会更困惑）。
     * 成功值缓存是为了省掉每次生成都 fork 一个进程的几十毫秒。
     */
    private volatile String cachedVersion;

    /** ffmpeg 是否可用。生成前必须先问一次，别等渲染完 117 帧才发现。 */
    public boolean available() {
        return version() != null;
    }

    public String version() {
        String cached = cachedVersion;
        if (cached != null) {
            return cached;
        }
        try {
            Result r = run(List.of(ffmpegPath, "-version"));
            if (!r.ok()) {
                return null;
            }
            String first = r.output().lines().findFirst().orElse("");
            if (first.isBlank()) {
                return null;
            }
            cachedVersion = first.trim();
            return cachedVersion;
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * 两遍编码：先全片共用一张调色板，再按调色板量化。
     *
     * <p>三点必须照做，动任何一个都会出问题：
     * <ul>
     *   <li>{@code stats_mode=full} —— 不用全片统计就会逐帧换调色板，静态区域闪烁；</li>
     *   <li>{@code dither=none} —— 抖动噪点会把低透明度的二维码糊掉，实测直接扫不出；</li>
     *   <li>{@code diff_mode=rectangle} —— 只写变化矩形，体积能压掉一半以上。</li>
     * </ul>
     */
    public void encodeGif(Path framesDir, int fps, Path paletteFile, Path outGif) throws IOException {
        String pattern = framesDir.resolve("f%04d.png").toString();

        Result gen = run(List.of(
                ffmpegPath, "-y", "-hide_banner", "-loglevel", "error",
                "-framerate", String.valueOf(fps),
                "-i", pattern,
                "-vf", "palettegen=stats_mode=full:max_colors=256",
                paletteFile.toString()));
        if (!gen.ok()) {
            throw new IOException("调色板生成失败: " + gen.tail());
        }

        Result use = run(List.of(
                ffmpegPath, "-y", "-hide_banner", "-loglevel", "error",
                "-framerate", String.valueOf(fps),
                "-i", pattern,
                "-i", paletteFile.toString(),
                "-lavfi", "paletteuse=dither=none:diff_mode=rectangle",
                "-loop", "0",
                outGif.toString()));
        if (!use.ok()) {
            throw new IOException("GIF 编码失败: " + use.tail());
        }
        if (!Files.exists(outGif) || Files.size(outGif) == 0) {
            throw new IOException("GIF 编码未产出文件");
        }
    }

    /**
     * 从成品 GIF 抽出末若干帧。
     *
     * <p>必须从 GIF 抽，不能拿内存里的 BufferedImage 校验：256 色量化与
     * diff 帧复用都发生在编码阶段，量化后的画质才是用户实际拿到的东西。
     *
     * @return 抽出的 PNG 文件，按帧序排列
     */
    public List<Path> extractTailFrames(Path gif, int totalFrames, int count, Path outDir) throws IOException {
        Files.createDirectories(outDir);
        int from = Math.max(0, totalFrames - count);

        // select 的表达式里逗号是参数分隔符，必须转义；ProcessBuilder 不过 shell，不能靠引号。
        // -fps_mode passthrough 不能用旧的 -vsync 0：ffmpeg 7 起已移除 -vsync，
        // 传了会直接认不出选项、一帧都不输出（这个坑让校验静默判成「全部不可扫」）。
        String filter = "select=gte(n\\," + from + ")";

        Result r = run(List.of(
                ffmpegPath, "-y", "-hide_banner", "-loglevel", "error",
                "-i", gif.toString(),
                "-vf", filter,
                "-fps_mode", "passthrough",
                outDir.resolve("c%03d.png").toString()));

        List<Path> files = listPngs(outDir);
        if (!r.ok() || files.isEmpty()) {
            // 退路：整段抽一遍再取尾部。慢一点，但不会因为 select 语法差异全军覆没
            log.warn("按帧号抽帧失败，回退到全量抽取: {}", r.tail());
            Files.createDirectories(outDir);
            run(List.of(ffmpegPath, "-y", "-hide_banner", "-loglevel", "error",
                    "-i", gif.toString(), "-fps_mode", "passthrough",
                    outDir.resolve("a%04d.png").toString()));
            files = listPngs(outDir);
            if (files.size() > count) {
                files = new ArrayList<>(files.subList(files.size() - count, files.size()));
            }
        }
        return files;
    }

    private List<Path> listPngs(Path dir) throws IOException {
        try (var stream = Files.list(dir)) {
            return stream.filter(p -> p.getFileName().toString().endsWith(".png")).sorted().toList();
        }
    }

    public record Result(int exitCode, String output) {
        public boolean ok() {
            return exitCode == 0;
        }

        /** 日志尾部若干行，用于错误信息 */
        public String tail() {
            String[] lines = output.strip().split("\n");
            int from = Math.max(0, lines.length - 4);
            return String.join(" | ", java.util.Arrays.copyOfRange(lines, from, lines.length));
        }
    }

    private Result run(List<String> command) {
        Path logFile = null;
        try {
            logFile = Files.createTempFile("ffmpeg-", ".log");
            ProcessBuilder pb = new ProcessBuilder(command);
            pb.redirectErrorStream(true);
            pb.redirectOutput(logFile.toFile());

            Process p = pb.start();
            if (!p.waitFor(TIMEOUT_SECONDS, TimeUnit.SECONDS)) {
                p.destroyForcibly();
                return new Result(-1, "ffmpeg 执行超时（" + TIMEOUT_SECONDS + "s）");
            }
            String output = Files.readString(logFile, StandardCharsets.UTF_8);
            return new Result(p.exitValue(), output);
        } catch (IOException e) {
            return new Result(-1, "无法启动 ffmpeg（" + ffmpegPath + "）: " + e.getMessage());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return new Result(-1, "ffmpeg 执行被中断");
        } finally {
            if (logFile != null) {
                try {
                    Files.deleteIfExists(logFile);
                } catch (IOException ignored) {
                    // 临时文件删不掉不影响主流程
                }
            }
        }
    }
}
