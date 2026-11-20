package com.qrstudio.barcode;

import com.google.zxing.common.BitMatrix;
import com.qrstudio.common.UserContext;
import com.qrstudio.entity.Order;
import com.qrstudio.mapper.OrderMapper;
import com.qrstudio.service.PricingService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;

/**
 * 条形码导出的编排层：校验 → 算尺寸 → 出图 → 自检 → 落盘 → 核销。
 *
 * <p>与 GIF 的最大差别是**不需要回退**：条的宽度比例由标准锁死，参数不对就是不对，
 * 没有「稍微抬一点就能过」的余地。所以这里的策略是「算不出来就明确拒绝并给出正确区间」，
 * 而不是自动试几轮 —— 自动改用户的标签尺寸会打出贴不上的东西。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class BarcodeExportService {

    /**
     * 并发闸门。编码 + PNG 是毫秒级，比 GIF 轻两个数量级，给 4 个槽位足够。
     * 仍然要限流：标签尺寸上限 200×150mm@600dpi 是 1600 万像素，四个并发就是 250MB 堆。
     */
    private static final int SLOTS = 4;

    private final OrderMapper orderMapper;
    private final PricingService pricingService;

    @Value("${app.upload.dir:data/uploads}")
    private String uploadDirPath;

    private final Semaphore slots = new Semaphore(SLOTS, true);

    // ------------------------------------------------------------------
    // 预览
    // ------------------------------------------------------------------

    /**
     * 免费预览：每模块恒 1 像素，不落盘。
     *
     * <p>117px 宽的图印在 40mm 上只有 74dpi，打出来必然是糊的 —— 付费墙天然生效，
     * 因此不需要水印（水印压条等于故意做废码，用户还以为是产品坏了）。
     *
     * <p>同时**按真实分辨率渲染一份并做同样的两档自检**，把「这组参数印出来读不出」
     * 提前告诉用户。否则用户付完钱才收到 422，虽然不扣费，但体验是「花钱买了个错误」。
     * 预览图本身仍是 1px/模块，自检用的那张不返回给前端。
     */
    public Map<String, Object> preview(BarcodeOptions options) {
        acquire();
        try {
            BarcodeSpec spec = options.normalize();
            BarcodeContent.Prepared content = BarcodeContent.prepare(spec.symbology(), spec.content());
            BitMatrix measure = BarcodeEncoder.measure(spec.symbology(), content.text());
            BarcodeMetrics metrics = BarcodeMetrics.compute(spec, content, measure.getWidth());

            BarcodeLayout layout = BarcodeLayout.of(metrics.imageWidth(), metrics.imageHeight(),
                    measure.getWidth(), spec.showText(), !spec.caption().isEmpty());
            int previewBarHeight = Math.max(8, layout.barHeight() / metrics.modulePx());

            BitMatrix previewBars = BarcodeEncoder.write(spec.symbology(), content.text(),
                    measure.getWidth(), previewBarHeight);
            byte[] png = BarcodeRenderer.toPng(BarcodeRenderer.renderPreview(previewBars));

            BitMatrix realBars = BarcodeEncoder.write(spec.symbology(), content.text(),
                    metrics.totalModules() * metrics.modulePx(), layout.barHeight());
            BarcodeVerifier.Report report = BarcodeVerifier.verify(
                    BarcodeRenderer.renderLabel(realBars, metrics, spec), spec.symbology(), content.text());

            Map<String, Object> out = new LinkedHashMap<>();
            out.put("dataUrl", "data:image/png;base64," + Base64.getEncoder().encodeToString(png));
            out.put("metrics", metrics.asMap());
            out.put("previewModulePx", 1);
            out.put("readable", report.allPass());
            out.put("verify", report.asMap());
            if (!report.allPass()) {
                out.put("reason", report.reason() + "，请加宽标签或提高 DPI");
            }
            return out;
        } finally {
            slots.release();
        }
    }

    // ------------------------------------------------------------------
    // 导出
    // ------------------------------------------------------------------

    public Map<String, Object> export(BarcodeOptions options, UserContext.CurrentUser user) {
        acquire();
        try {
            BarcodeSpec spec = options.normalize();
            BarcodeContent.Prepared content = BarcodeContent.prepare(spec.symbology(), spec.content());

            Order order = resolveOrder(options.getOrderId(), user);
            if (order != null && order.getResultUrl() != null && !order.getResultUrl().isBlank()) {
                // 同一笔订单重复提交：给回上次那两个文件，不重渲、不重复扣费
                return cached(order);
            }

            BitMatrix measure = BarcodeEncoder.measure(spec.symbology(), content.text());
            BarcodeMetrics metrics = BarcodeMetrics.compute(spec, content, measure.getWidth());

            BarcodeLayout layout = BarcodeLayout.of(metrics.imageWidth(), metrics.imageHeight(),
                    measure.getWidth(), spec.showText(), !spec.caption().isEmpty());
            BitMatrix bars = BarcodeEncoder.write(spec.symbology(), content.text(),
                    metrics.totalModules() * metrics.modulePx(), layout.barHeight());

            var image = BarcodeRenderer.renderLabel(bars, metrics, spec);
            BarcodeVerifier.Report report = BarcodeVerifier.verify(image, spec.symbology(), content.text());
            if (!report.allPass()) {
                // 自检没过是我们的参数问题，用户不该为一次失败的产出付费
                throw new BarcodeException(422, report.reason() + "。请加宽标签或提高 DPI 后重试（本次未扣费）",
                        Map.of("verify", report.asMap(), "metrics", metrics.asMap()));
            }

            String svg = BarcodeSvgWriter.write(bars, metrics, spec);
            Path pngPath = outputPath(order, "png");
            Path svgPath = outputPath(order, "svg");
            Files.createDirectories(pngPath.getParent());
            Files.write(pngPath, BarcodeRenderer.toPng(image));
            Files.write(svgPath, svg.getBytes(StandardCharsets.UTF_8));

            commitOrder(order, pngPath);

            Map<String, Object> out = new LinkedHashMap<>();
            out.put("pngUrl", "/uploads/barcode/" + pngPath.getFileName());
            out.put("svgUrl", "/uploads/barcode/" + svgPath.getFileName());
            out.put("metrics", metrics.asMap());
            out.put("verify", report.asMap());
            return out;
        } catch (IOException e) {
            log.error("条形码导出失败: {}", e.getMessage(), e);
            throw new BarcodeException(500, "文件写入失败：" + e.getMessage());
        } finally {
            slots.release();
        }
    }

    private void acquire() {
        boolean ok;
        try {
            ok = slots.tryAcquire(300, TimeUnit.MILLISECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new BarcodeException(429, "请求被中断，请重试");
        }
        if (!ok) {
            throw new BarcodeException(429, "当前导出请求较多，请稍后重试（不会重复扣费）");
        }
    }

    // ------------------------------------------------------------------
    // 订单
    // ------------------------------------------------------------------

    /**
     * 校验订单，返回需要核销的那一笔；免费场景返回 null。
     *
     * <p>与 {@code GifExportService} 同一套判定：状态、归属、计费项三重比对。
     * 唯一的差别在这里**先放行「已核销但有产物」的订单**，让它走到幂等分支 ——
     * 否则用户刷新页面再点一次下载，看到的是「订单已被使用」，而文件其实还在。
     */
    private Order resolveOrder(String orderId, UserContext.CurrentUser user) {
        boolean admin = user != null && "admin".equals(user.getRole());
        boolean paywall = pricingService.isPaywallActive(PricingService.ACTION_BARCODE, null);

        if (admin || !paywall) {
            return orderId == null || orderId.isBlank() ? null : orderMapper.selectById(orderId);
        }
        if (orderId == null || orderId.isBlank()) {
            throw new BarcodeException(402, "该功能需付费使用，请先完成扫码支付");
        }
        Order order = orderMapper.selectById(orderId);
        if (order == null) {
            throw new BarcodeException(402, "订单不存在，请重新下单");
        }
        boolean hasResult = order.getResultUrl() != null && !order.getResultUrl().isBlank();
        if ("used".equals(order.getStatus()) && !hasResult) {
            throw new BarcodeException(402, "该订单已被使用，每次导出都需要单独下单");
        }
        if (!"used".equals(order.getStatus()) && !"paid".equals(order.getStatus())) {
            throw new BarcodeException(402, "订单尚未支付或审核未通过，请完成支付或等待审核");
        }
        if (user == null || !Objects.equals(order.getUserId(), user.getUserId())) {
            throw new BarcodeException(402, "该订单不属于当前账号，请重新下单");
        }
        if (!PricingService.ACTION_BARCODE.equals(order.getActionType())) {
            throw new BarcodeException(402, "订单对应的计费项不匹配，请重新下单");
        }
        return order;
    }

    private void commitOrder(Order order, Path pngPath) {
        if (order == null) {
            return;
        }
        order.setStatus("used");
        order.setResultUrl("/uploads/barcode/" + pngPath.getFileName());
        orderMapper.updateById(order);
    }

    private Map<String, Object> cached(Order order) {
        String pngUrl = order.getResultUrl();
        String svgUrl = pngUrl.endsWith(".png")
                ? pngUrl.substring(0, pngUrl.length() - 4) + ".svg"
                : pngUrl;
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("pngUrl", pngUrl);
        out.put("svgUrl", svgUrl);
        out.put("cached", true);
        return out;
    }

    private Path outputPath(Order order, String ext) {
        String name = order != null
                ? order.getId() + "." + ext
                : "barcode-" + UUID.randomUUID() + "." + ext;
        return Path.of(uploadDirPath, "barcode", name);
    }
}
