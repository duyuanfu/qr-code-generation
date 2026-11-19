package com.qrstudio.gif;

import com.google.zxing.*;
import com.google.zxing.common.GlobalHistogramBinarizer;
import com.google.zxing.common.HybridBinarizer;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.awt.image.BufferedImage;
import java.awt.image.DataBufferInt;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

/**
 * 可扫性校验（brief §9）。
 *
 * <p>用 ZXing 而不是 OpenCV：Java 侧调 OpenCV 只能走 JavaCPP Presets，单平台 native
 * 包 250MB 起步、glibc 构建跑不了 Alpine，而 brief 首选的 {@code wechat_qrcode}
 * 引擎属 opencv_contrib，bytedeco 根本没预编译。相比之下 ZXing 是 500KB 纯 Java。
 *
 * <p>识别率确实不如微信引擎，但这里它只承担「当前参数够不够」的判断题 ——
 * 判得严一点，后果是回退多走一级，不会产出不可扫的成品。为了弥补召回，
 * 解码时开 {@code TRY_HARDER} 与 {@code ALSO_INVERTED}。
 */
@Slf4j
@Component
public class QrScanVerifier {

    /** 三种真实消费场景：原图、小窗预览、微信内嵌缩略 */
    private static final int[] SMALLER_SIZES = {640, 480};
    private static final double SMALL_BLUR = 0.6;

    private final Map<DecodeHintType, Object> hints;

    public QrScanVerifier() {
        Map<DecodeHintType, Object> h = new EnumMap<>(DecodeHintType.class);
        h.put(DecodeHintType.TRY_HARDER, Boolean.TRUE);
        h.put(DecodeHintType.ALSO_INVERTED, Boolean.TRUE);
        h.put(DecodeHintType.POSSIBLE_FORMATS, List.of(BarcodeFormat.QR_CODE));
        this.hints = h;
    }

    /** 三条件校验结果 */
    public record Report(boolean nativeOk, boolean size640Ok, boolean size480Ok) {
        public boolean allPass() {
            return nativeOk && size640Ok && size480Ok;
        }

        /**
         * 最关键的失败条件，用于给用户看得懂的原因。
         *
         * <p>原尺寸都解不出，说明二维码压根没被画清楚（定位图案被压没了）；
         * 只有小尺寸失败，说明对比度勉强够，屏幕压缩后就没了。
         */
        public String reason() {
            if (allPass()) {
                return null;
            }
            if (!nativeOk) {
                return "二维码在原尺寸下就无法识别，四角定位图案可能被压得过淡";
            }
            return "二维码在小尺寸（640/480）下无法识别，对比度偏低，屏幕压缩后会扫不出";
        }

        public Map<String, Boolean> asMap() {
            return Map.of("800", nativeOk, "640_blur", size640Ok, "480_blur", size480Ok);
        }
    }

    /** 单张图能否解出内容 */
    public boolean decodable(BufferedImage img) {
        return decode(img) != null;
    }

    public String decode(BufferedImage img) {
        if (img == null || img.getWidth() < 16 || img.getHeight() < 16) {
            return null;
        }
        int w = img.getWidth();
        int h = img.getHeight();
        int[] pixels = new int[w * h];
        img.getRGB(0, 0, w, h, pixels, 0, w);

        LuminanceSource source = new RGBLuminanceSource(w, h, pixels);

        // 两种二值化都试：HybridBinarizer 按 8×8 块估局部阈值，适合均匀光照；
        // 但当二维码四周是大片纯白（衬底 + 白底图）时，局部块里没有黑像素，
        // 估出来的阈值会把整块判白，导致大尺寸反而解不出、缩小后才解出。
        // GlobalHistogramBinarizer 用全局直方图，正好补这个盲区。
        for (boolean global : new boolean[]{false, true}) {
            Binarizer binarizer = global
                    ? new GlobalHistogramBinarizer(source)
                    : new HybridBinarizer(source);
            try {
                Result r = new MultiFormatReader().decode(new BinaryBitmap(binarizer), hints);
                if (r != null && r.getText() != null && !r.getText().isBlank()) {
                    return r.getText();
                }
            } catch (NotFoundException e) {
                // 换另一种二值化继续试
            } catch (Exception e) {
                log.debug("解码异常: {}", e.getMessage());
            }
        }
        return null;
    }

    /** 三条件校验（原尺寸 / 640+blur / 480+blur） */
    public Report verify(BufferedImage frame) {
        boolean nativeOk = decodable(frame);
        boolean s640 = decodable(shrink(frame, SMALLER_SIZES[0]));
        boolean s480 = decodable(shrink(frame, SMALLER_SIZES[1]));
        return new Report(nativeOk, s640, s480);
    }

    /** 缩到指定边长后轻微模糊 —— 模拟「被微信压过一道」的画质 */
    private BufferedImage shrink(BufferedImage src, int target) {
        int w = src.getWidth();
        int h = src.getHeight();
        int nw = Math.min(target, w);
        int nh = Math.max(1, (int) Math.round(h * (nw / (double) w)));
        BufferedImage resized = (nw == w) ? src : ImageOps.resize(src, nw, nh);
        return blurLuma(resized, SMALL_BLUR);
    }

    /** 只对亮度通道模糊：扫描器本来就是按灰度处理的，没必要跑四条通道 */
    private BufferedImage blurLuma(BufferedImage src, double sigma) {
        int w = src.getWidth();
        int h = src.getHeight();
        int[] px = new int[w * h];
        src.getRGB(0, 0, w, h, px, 0, w);

        float[] lum = new float[w * h];
        for (int i = 0; i < px.length; i++) {
            int c = px[i];
            int r = (c >>> 16) & 0xFF;
            int g = (c >>> 8) & 0xFF;
            int b = c & 0xFF;
            lum[i] = (float) (0.299 * r + 0.587 * g + 0.114 * b);
        }
        lum = FastBlur.gaussian(lum, w, h, sigma);

        BufferedImage out = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        int[] dst = ((DataBufferInt) out.getRaster().getDataBuffer()).getData();
        for (int i = 0; i < lum.length; i++) {
            int v = ImageOps.clamp255(lum[i]);
            dst[i] = (v << 16) | (v << 8) | v;
        }
        return out;
    }
}
