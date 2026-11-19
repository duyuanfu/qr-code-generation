package com.qrstudio.gif;

import com.qrstudio.common.UserContext;
import com.qrstudio.entity.Order;
import com.qrstudio.mapper.OrderMapper;
import com.qrstudio.service.PricingService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;

/**
 * GIF 导出的编排层：预检、订单校验、回退、体积控制、落盘。
 *
 * <p>把「跑一次渲染」交给 {@link GifRenderService}，这里只负责决策 ——
 * 要不要再跑一次、跑之前该改哪个参数、跑完能不能交付。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class GifExportService {

    /** 单次生成的并发上限：一个请求要吃 6~8s CPU 和 60MB 临时磁盘 */
    private static final int GENERATE_SLOTS = 2;
    /** 预检轻得多，但也不能放任刷 */
    private static final int PRECHECK_SLOTS = 3;

    /** 总渲染次数上限，防止「降画布之后又不可扫」来回震荡 */
    private static final int MAX_ATTEMPTS = 6;

    private static final long MB = 1024L * 1024L;

    private final GifRenderService renderService;
    private final QrScanVerifier verifier;
    private final OrderMapper orderMapper;
    private final PricingService pricingService;

    @Value("${app.upload.dir:data/uploads}")
    private String uploadDirPath;

    private final Semaphore generateSlots = new Semaphore(GENERATE_SLOTS, true);
    private final Semaphore precheckSlots = new Semaphore(PRECHECK_SLOTS, true);

    public record Suggestion(double cornerMult, double qrOpacity, int qrSize) {
    }

    public record PrecheckResult(boolean ok, String reason, Suggestion suggestion, long millis) {
    }

    public record GenerateResult(String url, Map<String, Object> meta, Map<String, Boolean> scanCheck) {
    }

    // ------------------------------------------------------------------
    // 预检
    // ------------------------------------------------------------------

    /**
     * 只渲染末帧，快速判断当前参数能不能扫出来。
     *
     * <p>放在付费之前：用户等 8 秒才被告知「扫不出来、请重调」是最差的体验，
     * 而这个判断只需要一次单帧渲染。
     */
    public PrecheckResult precheck(GifOptions options) {
        if (!precheckSlots.tryAcquire()) {
            throw new GifException(429, "当前预览请求较多，请稍后再试");
        }
        long start = System.currentTimeMillis();
        try {
            GifOptions opts = options.normalize();
            BufferedImage bg = readImage(opts.getBackgroundUrl(), "底图");
            BufferedImage qr = readImage(opts.getQrUrl(), "二维码图片");
            requireDecodableQr(qr);

            QrScanVerifier.Report report = renderLastFrame(opts, bg, qr);
            if (report.allPass()) {
                return new PrecheckResult(true, null, null, System.currentTimeMillis() - start);
            }

            Suggestion suggestion = probe(opts, bg, qr);
            return new PrecheckResult(false, report.reason(), suggestion, System.currentTimeMillis() - start);
        } finally {
            precheckSlots.release();
        }
    }

    private QrScanVerifier.Report renderLastFrame(GifOptions opts, BufferedImage bg, BufferedImage qr) {
        FrameComposer composer = new FrameComposer(opts, bg, qr);
        BufferedImage last = composer.frame(composer.totalFrames() - 1);
        return verifier.verify(last);
    }

    /**
     * 探测一个能过的档位。
     *
     * <p>顺序与回退顺序一致：先抬四角系数（对画面观感影响最小，只是定位图案稍实一点），
     * 再抬整体不透明度（会让二维码更显眼），最后才放大二维码（会破坏构图）。
     * 三档都过不了就不再猜了 —— 说明问题不在参数，而在素材本身。
     */
    private Suggestion probe(GifOptions opts, BufferedImage bg, BufferedImage qr) {
        double[][] tiers = {
                {Math.min(1.0, opts.getCornerMult() + 0.25), opts.getQrOpacity()},
                {0.80, Math.min(1.0, opts.getQrOpacity() + 0.15)},
                {1.00, Math.min(1.0, opts.getQrOpacity() + 0.30)},
        };
        for (double[] tier : tiers) {
            GifOptions trial = opts.copy();
            trial.setCornerMult(tier[0]);
            trial.setQrOpacity(tier[1]);
            if (renderLastFrame(trial, bg, qr).allPass()) {
                return new Suggestion(round2(tier[0]), round2(tier[1]), trial.getQrSize());
            }
        }
        return null;
    }

    // ------------------------------------------------------------------
    // 生成
    // ------------------------------------------------------------------

    public GenerateResult generate(GifOptions options, UserContext.CurrentUser user) {
        boolean acquired;
        try {
            acquired = generateSlots.tryAcquire(200, TimeUnit.MILLISECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new GifException(429, "生成被中断，请重试");
        }
        if (!acquired) {
            throw new GifException(429, "当前生成任务较多，请稍后重试（不会重复扣费）");
        }
        try {
            GifOptions opts = options.normalize();

            Order order = resolveOrder(opts.getOrderId(), user);
            if (order != null && order.getResultUrl() != null && !order.getResultUrl().isBlank()) {
                // 同一笔订单重复请求：直接给回上次的文件，不重渲、不二次收费
                return cachedResult(order);
            }

            BufferedImage bg = readImage(opts.getBackgroundUrl(), "底图");
            BufferedImage qr = readImage(opts.getQrUrl(), "二维码图片");
            requireDecodableQr(qr);

            Path outFile = outputFile(order);
            Files.createDirectories(outFile.getParent());

            Attempt attempt = renderWithFallback(opts, bg, qr, outFile);

            if (!attempt.outcome().report().allPass()) {
                // 扫不出来是我们的参数问题，不该让用户为一次失败的产出付费
                safeDelete(outFile);
                Suggestion suggestion = probe(opts, bg, qr);
                throw new GifException(422,
                        attempt.outcome().report().reason() + "，请按建议调整后重试（本次未扣费）",
                        suggestion);
            }

            commitOrder(order, outFile);

            Map<String, Object> meta = new LinkedHashMap<>();
            meta.put("width", attempt.outcome().outputSize());
            meta.put("height", attempt.outcome().outputSize());
            meta.put("fps", GifOptions.FPS);
            meta.put("frames", attempt.outcome().frames());
            meta.put("duration", round2(attempt.outcome().frames() / (double) GifOptions.FPS));
            meta.put("bytes", attempt.outcome().bytes());
            meta.put("qrBox", attempt.outcome().qrBox());
            meta.put("qrSize", opts.qrPixels());
            meta.put("qrOpacity", round2(opts.getQrOpacity()));
            meta.put("cornerMult", round2(opts.getCornerMult()));
            meta.put("blur", round2(opts.blurRadius()));
            meta.put("attempts", attempt.log());
            meta.put("warnings", attempt.warnings());
            meta.put("renderMillis", attempt.outcome().renderMillis());

            return new GenerateResult("/uploads/gif/" + outFile.getFileName(), meta,
                    attempt.outcome().report().asMap());
        } catch (IOException e) {
            log.error("GIF 生成失败: {}", e.getMessage(), e);
            throw new GifException(500, "生成失败：" + e.getMessage());
        } finally {
            generateSlots.release();
        }
    }

    private record Attempt(GifRenderService.Outcome outcome, List<String> log, List<String> warnings) {
    }

    /**
     * 渲染 + 自动回退 + 体积控制。
     *
     * <p>两个目标可能互相拉扯：降画布省体积会让二维码实际像素变小、更容易扫不出。
     * 所以放在同一个循环里统一决策，而不是先修 A 再修 B。
     */
    private Attempt renderWithFallback(GifOptions opts, BufferedImage bg, BufferedImage qr, Path outFile)
            throws IOException {
        GifOptions cur = opts.copy();
        List<String> logLines = new ArrayList<>();
        List<String> warnings = new ArrayList<>();
        long hardMax = (long) (cur.getTargetSizeMb() * MB);

        GifRenderService.Outcome out = null;
        for (int i = 0; i < MAX_ATTEMPTS; i++) {
            out = renderService.render(cur, bg, qr, outFile);

            boolean scanOk = out.report().allPass();
            boolean sizeOk = out.bytes() <= hardMax;

            if (scanOk && sizeOk) {
                break;
            }
            if (!scanOk) {
                String desc = escalate(cur);
                if (desc == null) {
                    break;
                }
                logLines.add("第 " + (i + 2) + " 次：" + desc);
                continue;
            }
            // 能扫但超体积：降画布。降到 512 还超就认了，硬压会牺牲可扫性
            if (cur.getOutputSize() <= 512) {
                warnings.add("体积 " + formatMb(out.bytes()) + "MB 超出目标 " + cur.getTargetSizeMb() + "MB，已到最小画布");
                break;
            }
            int next = Math.max(512, (int) Math.round(cur.getOutputSize() * 0.86));
            logLines.add("第 " + (i + 2) + " 次：体积超限，画布 " + cur.getOutputSize() + " → " + next);
            cur.setOutputSize(next);
        }

        return new Attempt(out, logLines, warnings);
    }

    /**
     * 回退一级，返回给用户看的描述；已无路可退返回 null。
     *
     * <p>顺序与 brief 不同：实测真实素材上先失败的是四角定位（0.30 太淡），
     * 先加不透明度只会把整块码提亮、白斑更明显，却仍卡在定位上，白走三四轮。
     */
    private String escalate(GifOptions cur) {
        if (cur.getCornerMult() < 0.99) {
            double v = Math.min(1.0, cur.getCornerMult() + 0.25);
            String desc = "四角系数 " + round2(cur.getCornerMult()) + " → " + round2(v);
            cur.setCornerMult(v);
            return desc;
        }
        if (cur.getQrOpacity() < 0.99) {
            double v = Math.min(1.0, cur.getQrOpacity() + 0.15);
            String desc = "二维码不透明度 " + round2(cur.getQrOpacity()) + " → " + round2(v);
            cur.setQrOpacity(v);
            return desc;
        }
        if (cur.getQrSize() < 540) {
            int v = Math.min(540, cur.getQrSize() + 40);
            String desc = "二维码边长 " + cur.getQrSize() + " → " + v;
            cur.setQrSize(v);
            return desc;
        }
        return null;
    }

    // ------------------------------------------------------------------
    // 订单
    // ------------------------------------------------------------------

    /**
     * 校验订单，返回需要核销的那一笔；免费场景返回 null。
     *
     * <p>与 {@code DynamicQrController} 保持同一套判定：状态、归属、计费项三重比对，
     * 任何一项对不上都不能放行，否则会出现「拿 ¥2 的静态导出订单解锁 GIF」。
     */
    private Order resolveOrder(String orderId, UserContext.CurrentUser user) {
        boolean admin = user != null && "admin".equals(user.getRole());
        boolean paywall = pricingService.isPaywallActive(PricingService.ACTION_GIF, null);

        if (admin || !paywall) {
            // 管理员的订单走 amount=0 免单通道，带了就核销，没带也放行
            return orderId == null || orderId.isBlank() ? null : orderMapper.selectById(orderId);
        }

        if (orderId == null || orderId.isBlank()) {
            throw new GifException(402, "该功能需付费使用，请先完成扫码支付");
        }
        Order order = orderMapper.selectById(orderId);
        if (order == null) {
            throw new GifException(402, "订单不存在，请重新下单");
        }
        if ("used".equals(order.getStatus())) {
            // 已核销但没结果（历史异常单）：允许用建议参数再试一次仍然不行，至少给明确提示
            throw new GifException(402, "该订单已被使用，每次生成都需要单独下单");
        }
        if (!"paid".equals(order.getStatus())) {
            throw new GifException(402, "订单尚未支付或审核未通过，请完成支付或等待审核");
        }
        if (user == null || !Objects.equals(order.getUserId(), user.getUserId())) {
            throw new GifException(402, "该订单不属于当前账号，请重新下单");
        }
        if (!PricingService.ACTION_GIF.equals(order.getActionType())) {
            throw new GifException(402, "订单对应的计费项不匹配，请重新下单");
        }
        return order;
    }

    private void commitOrder(Order order, Path outFile) {
        if (order == null) {
            return;
        }
        order.setStatus("used");
        order.setResultUrl("/uploads/gif/" + outFile.getFileName());
        orderMapper.updateById(order);
    }

    private GenerateResult cachedResult(Order order) {
        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("cached", true);
        return new GenerateResult(order.getResultUrl(), meta,
                Map.of("800", true, "640_blur", true, "480_blur", true));
    }

    private Path outputFile(Order order) {
        String name = order != null
                ? order.getId() + ".gif"
                : "gif-" + java.util.UUID.randomUUID() + ".gif";
        return Path.of(uploadDirPath, "gif", name);
    }

    // ------------------------------------------------------------------
    // 素材
    // ------------------------------------------------------------------

    /**
     * 解析 /uploads/xxx 到磁盘路径。
     *
     * <p>只接受一级文件名，挡住 {@code ../} 之类的路径穿越 —— 这个参数来自请求体，
     * 不校验的话用户可以读到服务器上任意可读文件。
     */
    private Path resolveUpload(String url, String label) {
        if (url == null || url.isBlank()) {
            throw new GifException(400, "请上传" + label);
        }
        String name;
        if (url.startsWith("/uploads/")) {
            name = url.substring("/uploads/".length());
        } else if (!url.startsWith("http")) {
            name = url;
        } else {
            throw new GifException(400, label + "需先上传到本站，不支持外链");
        }
        if (name.isEmpty() || name.contains("/") || name.contains("\\") || name.contains("..")) {
            throw new GifException(400, label + "路径非法");
        }
        Path path = Path.of(uploadDirPath, name);
        if (!Files.isRegularFile(path)) {
            throw new GifException(400, label + "文件不存在，请重新上传");
        }
        return path;
    }

    private BufferedImage readImage(String url, String label) {
        Path path = resolveUpload(url, label);
        try {
            BufferedImage img = ImageIO.read(path.toFile());
            if (img == null) {
                throw new GifException(400, label + "格式不受支持（请用 JPG / PNG）");
            }
            // 超大图直接读进来会 OOM；正常素材不会到这个量级
            if (img.getWidth() > 6000 || img.getHeight() > 6000) {
                throw new GifException(400, label + "尺寸过大（最长边需 ≤ 6000px）");
            }
            return img;
        } catch (IOException e) {
            throw new GifException(400, label + "读取失败：" + e.getMessage());
        }
    }

    /** 二维码原图都解不出，说明传错了图，早点拦住别浪费一次完整渲染 */
    private void requireDecodableQr(BufferedImage qr) {
        if (!verifier.decodable(qr)) {
            throw new GifException(400, "二维码图片无法识别，请确认上传的是清晰的二维码图（黑码白底）");
        }
    }

    private void safeDelete(Path path) {
        try {
            Files.deleteIfExists(path);
        } catch (IOException ignored) {
            // 删不掉就留着，下次同订单覆盖
        }
    }

    private static double round2(double v) {
        return Math.round(v * 100) / 100.0;
    }

    static String formatMb(long bytes) {
        return String.format("%.2f", bytes / (double) MB);
    }
}
