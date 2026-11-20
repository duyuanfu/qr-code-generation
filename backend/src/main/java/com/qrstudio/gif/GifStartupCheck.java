package com.qrstudio.gif;

import com.qrstudio.common.BundledFonts;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.awt.Font;

/**
 * 启动自检。
 *
 * <p>GIF 导出依赖三个外部条件：ffmpeg 可执行、中文字体加载成功、AWT 能渲染。
 * 任何一个缺失，用户要到「点了生成、等了 8 秒」才会看到错误。这里在启动时
 * 一次性把结论打进日志，排查时不用猜。
 *
 * <p>刻意只告警不阻断启动：这三个条件只影响 GIF 导出，不该让整个站点起不来。
 */
@Slf4j
@Component
@Order(10)
@RequiredArgsConstructor
public class GifStartupCheck implements ApplicationRunner {

    private final FfmpegCli ffmpeg;

    @Value("${app.upload.dir:data/uploads}")
    private String uploadDir;

    @Override
    public void run(ApplicationArguments args) {
        String version = ffmpeg.version();
        if (version == null) {
            log.error("GIF 导出不可用：找不到 ffmpeg。请确认容器内已安装 ffmpeg，"
                    + "或用 app.gif.ffmpeg 指定可执行文件路径");
        } else {
            log.info("GIF 导出就绪：{}", version);
        }

        Font font = BundledFonts.base();
        if (BundledFonts.canRenderChinese()) {
            log.info("中文字体就绪：{} / {}", font.getFontName(), font.getFamily());
        } else {
            log.error("中文字体不可用：{} 缺失或缺少中文字形，生成的 GIF 上文字会显示为方块",
                    "/fonts/NotoSansSC-Bold.otf");
        }

        log.info("GIF 产物目录：{}", java.nio.file.Path.of(uploadDir, "gif").toAbsolutePath());
    }
}
