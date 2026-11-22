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

    /**
     * 白边几何的两条不变量。
     *
     * <p>淡出带必须比 sigma 宽得多，否则裁切点上 alpha 还有一半 —— 白衬底会停在一条
     * 刀切线上，看起来像「二维码贴在一张白卡上」。0.09 / 0.085 那组旧值就是这么翻车的。
     *
     * <p>另一头是「白边不要太宽」：pad 超过码宽 7.5% 就是肉眼可见的一圈白框。
     */
    @Test
    void haloFadeCompletesInsidePad() {
        for (int qrSize : new int[]{160, 240, 320, 480, 560}) {
            for (int canvas : new int[]{480, 800, 1080}) {
                GifOptions o = new GifOptions();
                o.setQrSize(qrSize);
                o.setOutputSize(canvas);
                o.normalize();

                double fade = (o.haloPad() - o.haloCoreExtra()) / o.haloFeather();
                assertTrue(fade >= 1.9, "淡出带太窄，会出现硬边：qr=" + qrSize + " canvas=" + canvas
                        + " fade=" + String.format("%.2f", fade));
                assertTrue(o.haloPad() <= o.qrPixels() * 0.075, "白边过宽：qr=" + qrSize
                        + " canvas=" + canvas + " pad=" + o.haloPad() + " qrPx=" + o.qrPixels());
                assertTrue(o.haloCoreExtra() >= 2, "实心区至少要托住码区，留点余量");
            }
        }
    }
}
