package com.qrstudio.gif;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.MultiFormatWriter;
import com.google.zxing.WriterException;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.awt.image.DataBufferInt;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Arrays;
import java.util.EnumMap;
import java.util.Map;

/**
 * 「去掉二维码中间的产品图案」。
 *
 * <p>为什么不是把图案涂白：那块位置本来就是数据模块，涂白只是把「彩色干扰」
 * 换成了「错误模块」，能不能扫全靠容错率，图案稍微大一点就废，还会在码中间
 * 留一块显眼的白斑。所以做法是 **解码 → 重新编码**：内容一个字不改，图像换成
 * 一张标准二维码，中间自然就没有图案了。
 *
 * <p>代价是原图的配色与圆点样式不会保留（那属于美化效果，用户想留就上传
 * 「无图案版」），换来的是重绘后的码 100% 可扫 —— 这正是本功能的目的。
 */
@Slf4j
@RequiredArgsConstructor
@Component
public class QrCleaner {

    /**
     * 重绘边长。
     *
     * <p>动图里二维码最大 540px（1080 画布上 qrSize 上限 ÷ 2），1024 留了接近
     * 一倍的余量，重绘后的图也能直接拿去别处用。
     */
    private static final int SIZE = 1024;

    /** 解码时看原图的上限：3000px 的截图全量解码要 36MB，1600 足够读出内容 */
    private static final int DECODE_MAX_SIDE = 1600;

    private final QrScanVerifier verifier;

    @Value("${app.upload.dir:data/uploads}")
    private String uploadDirPath;

    /** @param content 解出来的原始内容，回给前端让用户确认「确实是我这张码」 */
    public record Cleaned(String url, String content, int size) {
    }

    /** 测试用：绕过 Spring 注入指定上传目录 */
    void setUploadDirPath(String path) {
        this.uploadDirPath = path;
    }

    public Cleaned clean(String url) {
        Path src = UploadPath.resolve(uploadDirPath, url, "二维码图片");
        BufferedImage img;
        try {
            img = ImageOps.readDownscaled(src, DECODE_MAX_SIDE);
        } catch (IOException e) {
            throw new GifException(400, "二维码图片读取失败：" + e.getMessage());
        }
        if (img == null) {
            throw new GifException(400, "二维码图片格式不受支持（请用 JPG / PNG）");
        }

        String content = verifier.decode(img);
        if (content == null) {
            throw new GifException(400, "这张二维码识别不出来，没法重绘。若中间图案盖住了三个定位角，"
                    + "或图片本身模糊，请换一张原始二维码再试");
        }

        try {
            Path out = write(encode(content));
            log.info("二维码已重绘（去图案）: {} → {}，内容长度 {}", url, out.getFileName(), content.length());
            return new Cleaned("/uploads/" + out.getFileName(), content, SIZE);
        } catch (IOException e) {
            throw new GifException(500, "重绘二维码失败：" + e.getMessage());
        }
    }

    private BitMatrix encode(String content) {
        Map<EncodeHintType, Object> hints = new EnumMap<>(EncodeHintType.class);
        hints.put(EncodeHintType.CHARACTER_SET, "UTF-8");
        // 容错率 H（30%）：重绘后的码将来贴 LOGO、被印刷磨损也还能读
        hints.put(EncodeHintType.ERROR_CORRECTION, ErrorCorrectionLevel.H);
        // 4 模块静区：标准要求，也是它在动图里能被扫到的前提（与上传的码一样带白边）
        hints.put(EncodeHintType.MARGIN, 4);
        try {
            return new MultiFormatWriter().encode(content, BarcodeFormat.QR_CODE, SIZE, SIZE, hints);
        } catch (WriterException e) {
            throw new GifException(400, "二维码内容无法重新编码：" + e.getMessage());
        }
    }

    /**
     * 落盘。
     *
     * <p>文件名取 PNG 字节的 SHA-256，与上传接口同一套「同内容同文件」语义：
     * 同一张码反复点「去图案」不会在磁盘上堆副本。
     */
    private Path write(BitMatrix matrix) throws IOException {
        byte[] png = toPng(matrix);
        Path dir = Path.of(uploadDirPath);
        Files.createDirectories(dir);
        Path out = dir.resolve(sha256Hex(png) + ".png");
        if (Files.exists(out)) {
            return out;
        }
        Path tmp = Files.createTempFile(dir, "clean-", ".png");
        Files.write(tmp, png);
        Files.move(tmp, out, StandardCopyOption.REPLACE_EXISTING);
        return out;
    }

    private static byte[] toPng(BitMatrix matrix) throws IOException {
        int w = matrix.getWidth();
        int h = matrix.getHeight();
        BufferedImage img = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        int[] px = ((DataBufferInt) img.getRaster().getDataBuffer()).getData();
        Arrays.fill(px, 0xFFFFFF);
        for (int y = 0; y < h; y++) {
            int row = y * w;
            for (int x = 0; x < w; x++) {
                if (matrix.get(x, y)) {
                    px[row + x] = 0x000000;
                }
            }
        }
        ByteArrayOutputStream bos = new ByteArrayOutputStream(64 * 1024);
        ImageIO.write(img, "png", bos);
        return bos.toByteArray();
    }

    private static String sha256Hex(byte[] data) {
        MessageDigest digest;
        try {
            digest = MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 不可用", e);
        }
        byte[] hash = digest.digest(data);
        StringBuilder sb = new StringBuilder(hash.length * 2);
        for (byte b : hash) {
            sb.append(Character.forDigit((b >> 4) & 0xF, 16));
            sb.append(Character.forDigit(b & 0xF, 16));
        }
        return sb.toString();
    }
}
