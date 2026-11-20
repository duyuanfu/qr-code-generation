package com.qrstudio.barcode;

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
import java.util.stream.Stream;

/**
 * 条形码产物清理。
 *
 * <p>与 GIF 的清理任务错开一分钟（GIF 是 04:30）：两个任务都会扫 {@code uploads} 下的目录，
 * 同时跑虽然不冲突，但日志交叠时不好排查。
 *
 * <p>保留 7 天：标签是「打印完就完事」的产物，用户真要再打一张，重新导出一份比翻旧文件快。
 */
@Slf4j
@Component
public class BarcodeCleanupTask {

    private static final int RETENTION_DAYS = 7;

    @Value("${app.upload.dir:data/uploads}")
    private String uploadDirPath;

    @Scheduled(cron = "0 31 4 * * ?")
    public void cleanup() {
        Path dir = Path.of(uploadDirPath, "barcode");
        if (!Files.isDirectory(dir)) {
            return;
        }
        Instant threshold = Instant.now().minus(RETENTION_DAYS, ChronoUnit.DAYS);
        int removed = 0;
        try (Stream<Path> stream = Files.list(dir)) {
            for (Path p : stream.toList()) {
                try {
                    FileTime modified = Files.getLastModifiedTime(p);
                    if (modified.toInstant().isBefore(threshold)) {
                        Files.deleteIfExists(p);
                        removed++;
                    }
                } catch (IOException e) {
                    log.debug("清理失败 {}: {}", p, e.getMessage());
                }
            }
        } catch (IOException e) {
            log.warn("扫描条形码产物目录失败 {}: {}", dir, e.getMessage());
        }
        if (removed > 0) {
            log.info("条形码产物清理完成：删除 {} 个超过 {} 天的文件", removed, RETENTION_DAYS);
        }
    }
}
