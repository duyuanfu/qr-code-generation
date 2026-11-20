package com.qrstudio.barcode;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.BinaryBitmap;
import com.google.zxing.DecodeHintType;
import com.google.zxing.LuminanceSource;
import com.google.zxing.MultiFormatReader;
import com.google.zxing.NotFoundException;
import com.google.zxing.RGBLuminanceSource;
import com.google.zxing.Result;
import com.google.zxing.common.GlobalHistogramBinarizer;
import com.google.zxing.common.HybridBinarizer;

import java.awt.*;
import java.awt.image.BufferedImage;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 交付前自检：自己生成的图自己解一遍。
 *
 * <p>只解原图几乎必过（图是我们自己画的），所以再加一档**模拟劣化**：
 * 缩到 50% 再叠一层模糊，近似「打印偏移 + 塑封反光 + 扫码枪距 20cm」。
 * 这一档还能拦住一类真实错误 —— 标签太窄导致每模块只有 1~2 像素时，
 * 原图能解、劣化后必挂，正好对应「印出来读不出」。
 */
public final class BarcodeVerifier {

    private BarcodeVerifier() {
    }

    public record Report(boolean nativeOk, boolean degradedOk, String nativeText, String degradedText) {

        public boolean allPass() {
            return nativeOk && degradedOk;
        }

        public String reason() {
            if (nativeOk && degradedOk) {
                return "校验通过";
            }
            if (!nativeOk) {
                return "生成的图片在理想条件下也解不出来（每模块像素过少或标签过窄）";
            }
            return "理想条件下可读，但按 50% 缩放 + 轻微模糊后解不出来，实际打印后可能读不出";
        }

        public Map<String, Boolean> asMap() {
            Map<String, Boolean> m = new LinkedHashMap<>();
            m.put("native", nativeOk);
            m.put("degraded", degradedOk);
            return m;
        }
    }

    /**
     * 劣化档的缩放系数。
     *
     * <p><b>实测出来的 0.7，不是设计稿最初写的 0.5。</b>一维码的模块像素本来就少：
     * 40mm/300dpi 下 EAN-13 是 4px、Code 39 只有 3px。固定砍一半会让 3px 掉到 1.5px
     * 再加模糊 —— 那是「手机远距离拍」的条件，比激光枪苛刻太多，会把完全能用的标签
     * 误判成不可用（用户付了钱收到 422）。改成 0.7 后：3px → 2.1px 可解，
     * 2px → 1.4px 仍解不出，该拦的照样拦得住。
     */
    static final double DEGRADE_SCALE = 0.7;

    public static Report verify(BufferedImage img, BarcodeSymbology symbology, String expectedText) {
        return verify(img, symbology, expectedText, DEGRADE_SCALE);
    }

    static Report verify(BufferedImage img, BarcodeSymbology symbology, String expectedText, double scale) {
        String nativeText = decode(img, symbology.format());
        String degradedText = decode(degrade(img, scale), symbology.format());
        return new Report(
                matches(nativeText, expectedText),
                matches(degradedText, expectedText),
                nativeText,
                degradedText);
    }

    /** EAN-13 解码结果可能被认成带前导 0 的 UPC-A，所以按「忽略前导 0」比较 */
    private static boolean matches(String decoded, String expected) {
        if (decoded == null) {
            return false;
        }
        return decoded.equals(expected) || stripZeros(decoded).equals(stripZeros(expected));
    }

    private static String stripZeros(String s) {
        int i = 0;
        while (i < s.length() - 1 && s.charAt(i) == '0') {
            i++;
        }
        return s.substring(i);
    }

    private static String decode(BufferedImage img, BarcodeFormat format) {
        int w = img.getWidth();
        int h = img.getHeight();
        int[] pixels = new int[w * h];
        img.getRGB(0, 0, w, h, pixels, 0, w);
        LuminanceSource source = new RGBLuminanceSource(w, h, pixels);

        Map<DecodeHintType, Object> hints = new EnumMap<>(DecodeHintType.class);
        hints.put(DecodeHintType.TRY_HARDER, Boolean.TRUE);
        hints.put(DecodeHintType.POSSIBLE_FORMATS, List.of(format));

        // 两种二值化都试：HybridBinarizer 按 8×8 块估局部阈值，适合均匀光照；
        // 大片纯白区域里局部块可能估不出阈值，GlobalHistogramBinarizer 补这个盲区。
        for (boolean global : new boolean[]{false, true}) {
            try {
                BinaryBitmap bitmap = new BinaryBitmap(global
                        ? new GlobalHistogramBinarizer(source)
                        : new HybridBinarizer(source));
                Result r = new MultiFormatReader().decode(bitmap, hints);
                if (r != null && r.getText() != null && !r.getText().isBlank()) {
                    return r.getText();
                }
            } catch (NotFoundException e) {
                // 换另一种二值化继续试
            } catch (RuntimeException e) {
                // 解码器的各种运行时异常都当作「这一档没解出来」
            }
        }
        return null;
    }

    /** 缩放 + 3×3 均值模糊 */
    static BufferedImage degrade(BufferedImage src, double scale) {
        int w = Math.max(1, (int) Math.round(src.getWidth() * scale));
        int h = Math.max(1, (int) Math.round(src.getHeight() * scale));
        BufferedImage small = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = small.createGraphics();
        try {
            g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
            g.drawImage(src, 0, 0, w, h, null);
        } finally {
            g.dispose();
        }
        return meanBlur(small);
    }

    /** 3×3 均值：1px 模糊足够近似，不值得为它引依赖或做可分离实现 */
    private static BufferedImage meanBlur(BufferedImage src) {
        int w = src.getWidth();
        int h = src.getHeight();
        int[] in = src.getRGB(0, 0, w, h, null, 0, w);
        int[] out = new int[in.length];
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                int sum = 0;
                for (int dy = -1; dy <= 1; dy++) {
                    int yy = Math.min(h - 1, Math.max(0, y + dy));
                    for (int dx = -1; dx <= 1; dx++) {
                        int xx = Math.min(w - 1, Math.max(0, x + dx));
                        sum += in[yy * w + xx] & 0xFF;
                    }
                }
                int v = sum / 9;
                out[y * w + x] = (v << 16) | (v << 8) | v;
            }
        }
        BufferedImage dst = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        dst.setRGB(0, 0, w, h, out, 0, w);
        return dst;
    }
}
