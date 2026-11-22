package com.qrstudio.gif;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/**
 * 编码器前置检查。
 *
 * <p>守的是一条真实踩过的路径：ffmpeg 缺失时**预检照样通过**（预检只渲染末帧、不编码），
 * 用户付钱进入生成，等 117 帧渲染完才在调色板那步失败 —— 表现是「等几秒直接报 500」。
 * {@link GifRenderService#requireEncoder()} 把这次失败提前到请求的第一百毫秒，
 * 并且给出「去装 ffmpeg」而不是一串 CreateProcess error。
 */
class GifEncoderGuardTest {

    @Test
    void missingEncoderFailsFastWithActionableMessage() {
        FfmpegCli ffmpeg = new FfmpegCli();
        ffmpeg.setFfmpegPath("definitely-not-a-real-ffmpeg-binary");
        assertFalse(ffmpeg.available(), "不存在的可执行文件不该被判定为可用");

        GifRenderService render = new GifRenderService(ffmpeg, new QrScanVerifier());

        GifException e = assertThrows(GifException.class, render::requireEncoder);
        assertEquals(503, e.getCode(), "编码器缺失是可恢复的环境问题，用 503 而不是 500");
        assertTrue(e.getMessage().contains("ffmpeg"), "文案要点名缺的是什么: " + e.getMessage());
        assertTrue(e.getMessage().contains("未扣费"), "文案要说明没花钱: " + e.getMessage());
        assertTrue(e.getMessage().contains("definitely-not-a-real-ffmpeg-binary"),
                "要回显当前配置的路径，否则用户不知道该改哪个配置: " + e.getMessage());
    }

    @Test
    void successfulProbeIsCachedSoGenerateDoesNotForkEveryTime() {
        FfmpegCli ffmpeg = new FfmpegCli();
        assumeTrue(ffmpeg.version() != null, "本机没有 ffmpeg，跳过缓存断言");

        GifRenderService render = new GifRenderService(ffmpeg, new QrScanVerifier());
        assertDoesNotThrow(render::requireEncoder);

        // 缓存生效后即使把路径改坏也仍判可用：证明第二次调用没有真的去 fork 进程
        ffmpeg.setFfmpegPath("definitely-not-a-real-ffmpeg-binary");
        assertTrue(ffmpeg.available(), "探测成功后应命中缓存");
        assertEquals(ffmpeg.version(), ffmpeg.version());
    }
}
