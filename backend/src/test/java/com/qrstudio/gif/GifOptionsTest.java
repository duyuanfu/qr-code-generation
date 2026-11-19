package com.qrstudio.gif;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/** 参数夹取与时间轴换算：这些数字决定成品的帧数、时长与体积，不能随手改 */
class GifOptionsTest {

    @Test
    void normalizeClampsOutOfRangeValues() {
        GifOptions o = new GifOptions();
        o.setHoldSeconds(0.1);
        o.setQrSize(9999);
        o.setCornerMult(0.1);
        o.setQrOpacity(0);
        o.setWaitSeconds(99);
        o.setOutputSize(100);
        o.normalize();

        assertEquals(0.4, o.getHoldSeconds(), 1e-9, "常驻短于 0.4s 会看不清");
        assertEquals(560, o.getQrSize());
        assertEquals(0.3, o.getCornerMult(), 1e-9);
        assertEquals(0.15, o.getQrOpacity(), 1e-9);
        assertEquals(10, o.getWaitSeconds());
        assertEquals(480, o.getOutputSize());
    }

    @Test
    void autoValuesSurviveNormalize() {
        GifOptions o = new GifOptions();
        o.setHaloAlpha(-1);
        o.setBlur(-1);
        o.normalize();
        assertEquals(-1, o.getHaloAlpha(), 1e-9, "-1 表示自动，不能被夹到 0.75");
        assertEquals(-1, o.getBlur(), 1e-9);
    }

    @Test
    void defaultTimelineMatchesReferenceImplementation() {
        GifOptions o = new GifOptions().normalize();
        assertEquals(75, o.framesCountdown(), "3 秒 × 25fps");
        assertEquals(30, o.framesFade(), "1.2 秒 × 25fps");
        assertEquals(12, o.framesHold(), "0.5 秒按 floor 截断 = 12 帧");
        assertEquals(117, o.totalFrames());
        assertEquals(4.68, o.durationSeconds(), 1e-9);
    }

    @Test
    void zeroWaitSkipsCountdown() {
        GifOptions o = new GifOptions();
        o.setWaitSeconds(0);
        o.normalize();
        assertEquals(0, o.framesCountdown());
    }

    @Test
    void derivedSizesScaleWithCanvas() {
        GifOptions o = new GifOptions().normalize();
        o.setOutputSize(400);
        assertEquals(160, o.qrPixels(), "qrSize 以 800 为基准，缩到 400 应减半");
        assertTrue(o.haloPad() > 0);
        assertTrue(o.blurRadius() > 0);
    }

    @Test
    void blurFollowsQrSizeWhenAutomatic() {
        GifOptions small = new GifOptions().normalize();
        small.setQrSize(320);
        GifOptions large = new GifOptions().normalize();
        large.setQrSize(480);
        assertTrue(large.blurRadius() > small.blurRadius(), "虚化半径应随二维码尺寸等比放大");
    }
}
