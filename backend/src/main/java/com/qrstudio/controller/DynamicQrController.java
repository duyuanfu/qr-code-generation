package com.qrstudio.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.qrstudio.common.FileValidator;
import com.qrstudio.common.MediaRef;
import com.qrstudio.common.MediaSizeResolver;
import com.qrstudio.common.Result;
import com.qrstudio.common.UserContext;
import com.qrstudio.entity.DynamicQr;
import com.qrstudio.entity.Order;
import com.qrstudio.entity.ScanLog;
import com.qrstudio.mapper.DynamicQrMapper;
import com.qrstudio.mapper.OrderMapper;
import com.qrstudio.mapper.ScanLogMapper;
import com.qrstudio.service.PricingService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

@RestController
@RequestMapping("/api/qr")
@RequiredArgsConstructor
public class DynamicQrController {

    private final DynamicQrMapper dynamicQrMapper;
    private final ScanLogMapper scanLogMapper;
    private final OrderMapper orderMapper;
    private final PricingService pricingService;
    private final MediaSizeResolver mediaSizeResolver;
    private final FileValidator fileValidator;
    private final ObjectMapper objectMapper;

    /** 把请求里的 mediaUrls（可能是字符串或对象数组）解析成媒体引用列表；解析失败返回空列表 */
    private List<MediaRef> parseMedia(Object mediaUrls) {
        if (mediaUrls == null) {
            return List.of();
        }
        try {
            return mediaUrls instanceof String
                    ? objectMapper.readValue((String) mediaUrls,
                            objectMapper.getTypeFactory().constructCollectionType(List.class, MediaRef.class))
                    : objectMapper.convertValue(mediaUrls,
                            objectMapper.getTypeFactory().constructCollectionType(List.class, MediaRef.class));
        } catch (Exception e) {
            // 解析失败说明内容格式不对，交给后续校验，不在这里中断流程
            return List.of();
        }
    }

    private static final String CHARS = "abcdefghjkmnpqrstuvwxyz23456789";
    private static final SecureRandom RANDOM = new SecureRandom();

    /** 合法内容类型白名单，同时用作按类型定价的键（wifi 已于 v2 迁移动态下线） */
    private static final java.util.Set<String> ALLOWED_CONTENT_TYPES =
            java.util.Set.of("url", "text", "vcard", "image", "video", "pdf", "file");

    /**
     * 必须携带附件的类型。
     *
     * <p>这四类活码的全部价值就在附件上：没有附件的「图片画廊」打开是一张白纸，
     * 而用户为此付了 ¥4~¥8。历史上确实落过这种空壳码（媒体列表为空或 url 为空串），
     * 只能事后清理，所以入口这关必须拦住。
     *
     * <p>反过来，url / text / vcard 是按类型白名单放行的静态内容，本就不带附件。
     */
    private static final java.util.Set<String> MEDIA_REQUIRED_TYPES =
            java.util.Set.of("image", "video", "pdf", "file");

    private static final java.util.Set<String> IMAGE_EXTS =
            java.util.Set.of(".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".avif");
    private static final java.util.Set<String> VIDEO_EXTS =
            java.util.Set.of(".mp4", ".m4v", ".mov", ".webm", ".mkv", ".avi", ".mpg", ".mpeg");

    /** 取扩展名（小写，含点）；取不到返回空串 */
    private String extOf(String url) {
        if (url == null) {
            return "";
        }
        String path = url;
        int q = path.indexOf('?');
        if (q >= 0) {
            path = path.substring(0, q);
        }
        int slash = path.lastIndexOf('/');
        String name = slash >= 0 ? path.substring(slash + 1) : path;
        int dot = name.lastIndexOf('.');
        return dot >= 0 ? name.substring(dot).toLowerCase() : "";
    }

    /**
     * 内容与所选类型是否自洽。
     *
     * 为什么必须有这一道：前端切换标签时如果状态没清干净，会把「视频」页上传的 mp4
     * 带到「PDF」页去下单，最终落库一条 contentType=pdf 但文件是视频的活码 ——
     * 扫码的人看到的是视频，而订单上写的是 PDF。前端已经修了根因，这里是服务端兜底，
     * 保证无论谁调接口都写不进自相矛盾的数据。
     */
    private String mediaTypeMismatch(String contentType, List<MediaRef> refs) {
        if (refs == null || refs.isEmpty()) {
            return null;
        }
        for (MediaRef ref : refs) {
            String ext = extOf(ref.getUrl());
            if (ext.isEmpty()) {
                continue; // 外链可能没有扩展名，不阻断
            }
            switch (contentType) {
                case "pdf":
                    if (!".pdf".equals(ext)) {
                        return "所选类型为 PDF，但上传的内容不是 PDF 文件，请重新上传";
                    }
                    break;
                case "video":
                    if (!VIDEO_EXTS.contains(ext)) {
                        return "所选类型为视频，但上传的内容不是视频文件，请重新上传";
                    }
                    break;
                case "image":
                    if (!IMAGE_EXTS.contains(ext)) {
                        return "所选类型为图片，但上传的内容不是图片文件，请重新上传";
                    }
                    break;
                default:
                    // file 类型允许任意附件
                    break;
            }
        }
        return null;
    }

    private String generateShortCode() {
        StringBuilder sb = new StringBuilder(6);
        for (int i = 0; i < 6; i++) {
            sb.append(CHARS.charAt(RANDOM.nextInt(CHARS.length())));
        }
        return sb.toString();
    }

    @Data
    public static class DynamicQrCreateRequest {
        private String contentType;
        private String title;
        private String description;
        private Object mediaUrls;
        private Object styleConfig;
        private String orderId;
    }

    @PostMapping("/dynamic")
    public Result<?> createDynamicQr(@RequestBody DynamicQrCreateRequest req) {
        if (req.getContentType() == null || req.getTitle() == null) {
            return Result.error("缺少必要参数");
        }
        if (req.getTitle().trim().isEmpty()) {
            return Result.error(400, "请填写二维码标题");
        }
        if (!ALLOWED_CONTENT_TYPES.contains(req.getContentType())) {
            return Result.error(400, "不支持的二维码内容类型: " + req.getContentType());
        }

        // 内容与所选类型必须自洽：pdf 类型不能装视频，视频类型不能装图片。
        // 这是一道服务端兜底，防止前端状态串味时写出「订单写 PDF、扫码看视频」的矛盾数据。
        List<MediaRef> mediaRefs = parseMedia(req.getMediaUrls());
        String mismatch = mediaTypeMismatch(req.getContentType(), mediaRefs);
        if (mismatch != null) {
            return Result.error(400, mismatch);
        }

        // 1. 合规校验：标题和描述违禁词拦截
        if (!fileValidator.checkTextCompliance(req.getTitle()) ||
            !fileValidator.checkTextCompliance(req.getDescription())) {
            return Result.error(400, "发布内容包含敏感合规词汇，系统已拦截");
        }

        UserContext.CurrentUser currentUser = UserContext.get();
        boolean isAdmin = currentUser != null && "admin".equals(currentUser.getRole());

        // 2. 收费墙校验（Admin 终身免费免核验）。价格按内容类型细分：
        //    image/video/pdf/file 等可以各自定价，未配置则回退到 dynamic_qr 通用价。
        Order paidOrder = null;
        if (!isAdmin) {
            String expectedKey = PricingService.keyFor(PricingService.ACTION_DYNAMIC, req.getContentType());

            if (pricingService.isPaywallActive(PricingService.ACTION_DYNAMIC, req.getContentType())) {
                if (req.getOrderId() == null || req.getOrderId().trim().isEmpty()) {
                    return Result.error(402, "该功能需付费使用，请先完成扫码支付");
                }

                paidOrder = orderMapper.selectById(req.getOrderId());
                if (paidOrder == null) {
                    return Result.error(402, "订单不存在，请重新下单");
                }
                // 已核销的订单要给出明确提示，否则用户会误以为是自己没付款
                if ("used".equals(paidOrder.getStatus())) {
                    return Result.error(402, "该订单已被使用，每次生成都需要单独下单");
                }
                if (!"paid".equals(paidOrder.getStatus())) {
                    return Result.error(402, "订单尚未支付或审核未通过，请完成支付或等待审核");
                }
                // 订单必须属于当前登录账号，杜绝跨账号复用他人订单
                if (currentUser == null || !Objects.equals(paidOrder.getUserId(), currentUser.getUserId())) {
                    return Result.error(402, "该订单不属于当前账号，请重新下单");
                }
                // 订单的定价键必须与本次内容类型一致，避免拿低价类型的订单解锁高价类型
                if (!pricingService.matchesOrder(
                        paidOrder.getActionType(), expectedKey, PricingService.ACTION_DYNAMIC)) {
                    return Result.error(402, "订单对应的二维码类型不匹配，请重新下单");
                }
                // 体积/件数也要对得上：下单后偷偷换一个更大的文件、或多塞几张图，不能按原来的价格放行
                java.util.List<Long> actualSizes = mediaSizeResolver.sizes(mediaRefs);
                BigDecimal required = pricingService.amountForItems(
                        PricingService.ACTION_DYNAMIC, req.getContentType(), actualSizes);
                // 金额缺失按 0 处理：否则一条 amount 为 null 的异常订单会直接跳过这道校验
                BigDecimal paid = paidOrder.getAmount() == null ? BigDecimal.ZERO : paidOrder.getAmount();
                if (paid.compareTo(required) < 0) {
                    return Result.error(402, "本次文件数量或体积超出该订单包含的额度，请重新下单补足差价");
                }
            }
        }

        // 附件类活码不允许空着生成：付了钱却扫出一张白纸，只能靠人工退款收场。
        // 放在付费校验之后：订单是否有效是用户当下最需要知道的信息
        // （「这笔订单用过了」比「你没传文件」更紧急），数据完整性是最后一道门。
        if (MEDIA_REQUIRED_TYPES.contains(req.getContentType()) && mediaRefs.isEmpty()) {
            return Result.error(400, "请至少上传一个文件再生成二维码");
        }

        try {
            String shortCode = generateShortCode();
            // Ensure unique
            while (dynamicQrMapper.selectOne(new LambdaQueryWrapper<DynamicQr>().eq(DynamicQr::getShortCode, shortCode)) != null) {
                shortCode = generateShortCode();
            }

            String mediaUrlsJson = req.getMediaUrls() instanceof String
                    ? (String) req.getMediaUrls()
                    : objectMapper.writeValueAsString(req.getMediaUrls());

            String styleConfigJson = req.getStyleConfig() != null
                    ? (req.getStyleConfig() instanceof String ? (String) req.getStyleConfig() : objectMapper.writeValueAsString(req.getStyleConfig()))
                    : null;

            // 服务有效期：由命中的定价项决定（当前业务为 3 个月），0 表示长期有效
            int validMonths = pricingService.validMonthsFor(PricingService.ACTION_DYNAMIC, req.getContentType());
            LocalDateTime expiresAt = validMonths > 0 ? LocalDateTime.now().plusMonths(validMonths) : null;

            DynamicQr qr = DynamicQr.builder()
                    .shortCode(shortCode)
                    .userId(currentUser != null ? currentUser.getUserId() : null)
                    .contentType(req.getContentType())
                    .title(req.getTitle())
                    .description(req.getDescription())
                    .mediaUrls(mediaUrlsJson)
                    .styleConfig(styleConfigJson)
                    .expiresAt(expiresAt)
                    .createdAt(LocalDateTime.now())
                    .updatedAt(LocalDateTime.now())
                    .build();

            dynamicQrMapper.insert(qr);

            // 3. 一次性核销：订单已被本次生成消费，防止同一笔订单无限复用
            if (paidOrder != null) {
                paidOrder.setStatus("used");
                orderMapper.updateById(paidOrder);
            }

            Map<String, Object> data = new HashMap<>();
            data.put("id", qr.getId());
            data.put("shortCode", qr.getShortCode());

            return Result.ok("生成成功", data);
        } catch (Exception e) {
            return Result.error("创建动态活码失败: " + e.getMessage());
        }
    }

    @GetMapping("/dynamic/{shortCode}")
    public Result<?> getDynamicQr(@PathVariable("shortCode") String shortCode, HttpServletRequest request) {
        DynamicQr qr = dynamicQrMapper.selectOne(new LambdaQueryWrapper<DynamicQr>().eq(DynamicQr::getShortCode, shortCode));
        if (qr == null) {
            return Result.error(404, "未找到该二维码内容");
        }

        // Asynchronously log scan record
        try {
            String userAgent = request.getHeader("User-Agent");
            String ip = request.getHeader("X-Forwarded-For");
            if (ip == null || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
                ip = request.getRemoteAddr();
            }

            String device = "Desktop";
            if (userAgent != null) {
                String ua = userAgent.toLowerCase();
                if (ua.contains("micromessenger")) device = "WeChat";
                else if (ua.contains("mobile") || ua.contains("android") || ua.contains("iphone")) device = "Mobile";
                else if (ua.contains("ipad") || ua.contains("tablet")) device = "Tablet";
            }

            ScanLog scanLog = ScanLog.builder()
                    .qrId(qr.getId())
                    .shortCode(shortCode)
                    .ip(ip)
                    .userAgent(userAgent)
                    .device(device)
                    .scannedAt(LocalDateTime.now())
                    .build();
            scanLogMapper.insert(scanLog);
        } catch (Exception ignored) {
        }

        return Result.ok(qr);
    }
}
