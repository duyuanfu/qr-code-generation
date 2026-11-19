package com.qrstudio.gif;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.stream.Stream;

/**
 * 产物与临时目录的每日清理。
 *
 * <p>两类垃圾：
 * <ul>
 *   <li>{@code .gif-tmp/*} —— 渲染中途崩溃/被 kill 时留下的帧序列，一次 30~60MB；</li>
 *   <li>{@code gif/*.gif} —— 用户已经下载走的成品。</li>
 * </ul>
 *
 * <p>成品保留 7 天：用户可能过两天想起来「上次那个动图再发我一份」，
 * 留一周足够覆盖，再长就是白占磁盘。
 */
@Slf4j
@Component
public class GifCleanupTask {

    private static final int TEMP_RETENTION_HOURS = 1;
    private static final int OUTPUT_RETENTION_DAYS = 7;

    @Value("${app.upload.dir:data/uploads}")
    private String uploadDirPath;

    /** 每天凌晨 4:30，避开使用高峰 */
    @Scheduled(cron = "0 30 4 * * ?")
    public void cleanup() {
        Path root = Path.of(uploadDirPath);
        int temp = purge(root.resolve(".gif-tmp"), Instant.now().minus(TEMP_RETENTION_HOURS, ChronoUnit.HOURS), true);
        int output = purge(root.resolve("gif"), Instant.now().minus(OUTPUT_RETENTION_DAYS, ChronoUnit.DAYS), false);
        if (temp > 0 || output > 0) {
            log.info("GIF 清理完成：临时目录 {} 项，过期成品 {} 个", temp, output);
        }
    }

    private int purge(Path dir, Instant threshold, boolean removeDirs) {
        if (!Files.isDirectory(dir)) {
            return 0;
        }
        int removed = 0;
        try (Stream<Path> stream = Files.list(dir)) {
            for (Path p : stream.toList()) {
                try {
                    FileTime modified = Files.getLastModifiedTime(p);
                    if (modified.toInstant().isBefore(threshold)) {
                        if (Files.isDirectory(p)) {
                            if (removeDirs) {
                                deleteTree(p);
                                removed++;
                            }
                        } else {
                            Files.deleteIfExists(p);
                            removed++;
                        }
                    }
                } catch (IOException e) {
                    log.debug("清理失败 {}: {}", p, e.getMessage());
                }
            }
        } catch (IOException e) {
            log.warn("扫描目录失败 {}: {}", dir, e.getMessage());
        }
        return removed;
    }

    private void deleteTree(Path dir) throws IOException {
        try (Stream<Path> walk = Files.walk(dir)) {
            walk.sorted(Comparator.reverseOrder()).forEach(p -> {
                try {
                    Files.deleteIfExists(p);
                } catch (IOException ignored) {
                    // 单个文件删不掉不影响其余
                }
            });
        }
    }
}
