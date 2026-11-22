package com.qrstudio.gif;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/**
 * 抽帧在真实 ffmpeg 上的行为。
 *
 * <p>线上事故（ffmpeg 4.4.2 不认识 {@code -fps_mode}）就是这条链路漏测导致的：
 * 参数名选错时 ffmpeg 不报「GIF 有问题」，只是**一帧都不输出**，于是成品被判成
 * 不可扫。这里用真 ffmpeg 造一段 6 帧 GIF，分别验证「参数正确」与「参数猜错」两条路。
 *
 * <p>没有 ffmpeg 时整体跳过，不让 CI 因环境红掉。
 */
class FfmpegCliExtractTest {

    private static final List<String> FPS_MODE = List.of("-fps_mode", "passthrough");
    private static final List<String> VSYNC = List.of("-vsync", "0");

    @Test
    void extractsTailFramesWithTheCorrectFlag() throws Exception {
        FfmpegCli cli = new FfmpegCli();
        assumeTrue(cli.version() != null, "本机没有 ffmpeg，跳过");

        Path dir = Files.createTempDirectory("gif-extract-");
        try {
            Path gif = makeGif(dir, 6);
            List<Path> files = cli.extractTailFrames(gif, 6, 5, dir.resolve("ok"));
            assertEquals(5, files.size(), "末 5 帧应全部抽出，实际 " + files.size());
        } finally {
            deleteRecursively(dir);
        }
    }

    @Test
    void flipsToTheOtherFlagWhenTheChosenOneIsRejected() throws Exception {
        FfmpegCli cli = new FfmpegCli();
        assumeTrue(cli.version() != null, "本机没有 ffmpeg，跳过");

        // 故意灌入「这个版本不支持」的那一种，模拟版本号误判
        List<String> correct = FfmpegCli.syncArgsFor(cli.version());
        cli.setSyncArgsForTest(correct.equals(FPS_MODE) ? VSYNC : FPS_MODE);

        Path dir = Files.createTempDirectory("gif-extract-flip-");
        try {
            Path gif = makeGif(dir, 6);
            List<Path> files = cli.extractTailFrames(gif, 6, 5, dir.resolve("flip"));
            assertEquals(5, files.size(),
                    "参数不被支持时应自动翻成另一种写法再抽，实际只抽到 " + files.size() + " 帧");
        } finally {
            deleteRecursively(dir);
        }
    }

    /** 用 ffmpeg 的 testsrc 造一段 GIF（不依赖任何素材文件） */
    private Path makeGif(Path dir, int frames) throws IOException, InterruptedException {
        Path gif = dir.resolve("src.gif");
        ProcessBuilder pb = new ProcessBuilder(
                "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
                "-f", "lavfi", "-i", "testsrc=size=96x96:rate=10",
                "-frames:v", String.valueOf(frames),
                gif.toString());
        pb.redirectErrorStream(true);
        pb.redirectOutput(dir.resolve("make.log").toFile());
        Process p = pb.start();
        assertEquals(0, p.waitFor(), "造测试 GIF 失败: " + Files.readString(dir.resolve("make.log")));
        assumeTrue(Files.size(gif) > 0, "测试 GIF 为空，跳过");
        return gif;
    }

    private void deleteRecursively(Path dir) throws IOException {
        if (!Files.exists(dir)) {
            return;
        }
        try (var walk = Files.walk(dir)) {
            walk.sorted(java.util.Comparator.reverseOrder()).forEach(p -> {
                try {
                    Files.deleteIfExists(p);
                } catch (IOException ignored) {
                    // 临时目录清理失败无所谓
                }
            });
        }
    }
}
