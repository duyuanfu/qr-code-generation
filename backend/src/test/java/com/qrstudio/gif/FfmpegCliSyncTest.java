package com.qrstudio.gif;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 抽帧时帧同步参数的选择。
 *
 * <p>这不是理论问题：线上跑的是 Ubuntu 22.04 自带 ffmpeg 4.4.2，它不认识
 * {@code -fps_mode}（5.1 才引入），抽帧命令直接 {@code Unrecognized option} 且
 * 一帧都不输出，于是成品被校验判成「不可扫」，用户侧看到的是「等几秒然后 500」。
 */
class FfmpegCliSyncTest {

    @Test
    void legacyFfmpegUsesVsync() {
        // 线上就是这一版
        assertEquals(List.of("-vsync", "0"),
                FfmpegCli.syncArgsFor(
                        "ffmpeg version 4.4.2-0ubuntu0.22.04.1 Copyright (c) 2000-2021 the FFmpeg developers"));
        assertEquals(List.of("-vsync", "0"), FfmpegCli.syncArgsFor("ffmpeg version 3.4.11-0ubuntu0.1"));
    }

    @Test
    void fiveZeroStillUsesVsyncButFiveOneUsesFpsMode() {
        assertEquals(List.of("-vsync", "0"), FfmpegCli.syncArgsFor("ffmpeg version 5.0.3 Copyright"));
        assertEquals(List.of("-fps_mode", "passthrough"),
                FfmpegCli.syncArgsFor("ffmpeg version 5.1.4-0+deb12u1"));
    }

    @Test
    void modernFfmpegUsesFpsMode() {
        assertEquals(List.of("-fps_mode", "passthrough"),
                FfmpegCli.syncArgsFor("ffmpeg version 6.1.1-full_build-www.gyan.dev"));
        assertEquals(List.of("-fps_mode", "passthrough"),
                FfmpegCli.syncArgsFor("ffmpeg version 7.0.2 Copyright"));
    }

    @Test
    void unrecognisedVersionDefaultsToLegacyAndReliesOnTheFlip() {
        assertEquals(List.of("-vsync", "0"), FfmpegCli.syncArgsFor(null));
        assertEquals(List.of("-vsync", "0"), FfmpegCli.syncArgsFor(""));
        // 滚动版认不出版本号：先按老写法，抽帧失败时会自动翻成 -fps_mode 重跑
        assertEquals(List.of("-vsync", "0"),
                FfmpegCli.syncArgsFor("ffmpeg version N-109742-g24450dc7f Copyright"));
    }

    @Test
    void parsesMajorMinorFromBanner() {
        assertArrayEquals(new int[]{4, 4},
                FfmpegCli.parseVersion("ffmpeg version 4.4.2-0ubuntu0.22.04.1 Copyright"));
        assertArrayEquals(new int[]{6, 1},
                FfmpegCli.parseVersion("ffmpeg version 6.1.1-full_build"));
        assertArrayEquals(new int[]{0, 0}, FfmpegCli.parseVersion("ffmpeg build unknown"));
    }

    @Test
    void recognisesTheExactMessageSeenInProduction() {
        String real = "Unrecognized option 'fps_mode'.\n"
                + "Error splitting the argument list: Option not found";
        assertTrue(FfmpegCli.mentionsUnknownOption(real, "-fps_mode"));
        // 其它失败（编解码错误）不该被误判成「选项不存在」，否则会白翻一次再失败
        assertFalse(FfmpegCli.mentionsUnknownOption("Output file is empty, nothing was encoded", "-fps_mode"));
        assertFalse(FfmpegCli.mentionsUnknownOption(null, "-fps_mode"));
    }
}
