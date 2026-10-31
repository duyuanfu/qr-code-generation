package com.qrstudio.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.qrstudio.common.MediaRef;
import com.qrstudio.common.MediaSizeResolver;
import com.qrstudio.common.Result;
import com.qrstudio.common.UserContext;
import com.qrstudio.entity.Order;
import com.qrstudio.entity.PricingConfig;
import com.qrstudio.mapper.OrderMapper;
import com.qrstudio.service.PricingService;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Random;

@RestController
@RequestMapping("/api/order")
@RequiredArgsConstructor
public class OrderController {

    private final OrderMapper orderMapper;
    private final PricingService pricingService;
    private final MediaSizeResolver mediaSizeResolver;

    /** 「一键模拟支付」快捷通道开关，生产环境必须保持 false */
    @Value("${app.paywall.mock-pay-enabled:false}")
    private boolean mockPayEnabled;

    @Data
    public static class CreateOrderRequest {
        private String actionType; // "dynamic_qr" | "static_export"
        /** 二维码内容类型：url/text/vcard/image/video/pdf/file，用于命中按类型细分的价格 */
        private String contentType;
        /** 本次要托管/导出的媒体文件列表，用于按体积阶梯计价 */
        private List<MediaRef> mediaUrls;
    }

    @Data
    public static class ConfirmOrderRequest {
        private String orderId;
        private String paymentVoucher;
    }

    @Data
    public static class MockPayRequest {
        private String orderId;
    }

    private UserContext.CurrentUser currentUser() {
        return UserContext.get();
    }

    private boolean isAdmin(UserContext.CurrentUser user) {
        return user != null && "admin".equals(user.getRole());
    }

    /** 订单是否归属于当前请求者；管理员可越权处理全部订单 */
    private boolean canAccess(Order order, UserContext.CurrentUser user) {
        if (user == null) return false;
        if (isAdmin(user)) return true;
        return user.getUserId() != null && user.getUserId().equals(order.getUserId());
    }

    /**
     * 统计本次媒体总字节数。
     *
     * <p>优先用服务端落盘文件的真实大小：客户端上报的 size 可以被篡改，
     * 而 /uploads/<sha256>.<ext> 是后端自己写出来的文件，长度可信。
     * 外链（http/https）无法 stat，只能退化为客户端上报值。
     */
    private java.util.List<Long> mediaSizes(List<MediaRef> mediaList) {
        return mediaSizeResolver.sizes(mediaList);
    }

    @PostMapping("/create")
    public Result<?> createOrder(@RequestBody CreateOrderRequest req) {
        UserContext.CurrentUser user = currentUser();
        if (user == null) {
            return Result.error(401, "请先登录后再进行操作");
        }

        String actionType = req.getActionType() != null ? req.getActionType() : PricingService.ACTION_DYNAMIC;
        String contentType = req.getContentType();

        // 活码必须带内容类型：否则可以用通用低价订单去解锁高价的视频/PDF 活码
        if (PricingService.ACTION_DYNAMIC.equals(actionType)
                && (contentType == null || contentType.isBlank())) {
            return Result.error(400, "缺少二维码类型，无法确定价格");
        }

        PricingConfig pricing = pricingService.resolve(actionType, contentType);

        if (pricing == null) {
            return Result.error(400, "不支持的计费项: " + PricingService.keyFor(actionType, contentType));
        }

        java.util.List<Long> itemSizes = mediaSizes(req.getMediaUrls());

        // 订单落库的是实际命中的定价键（如 dynamic_qr.video），核销时按类型严格比对
        String priceKey = pricing.getItemKey();
        // 按件累加：每个文件各收一次基础价（图片 ¥4/张、文件 ¥6/个…）
        BigDecimal amount = pricingService.amountForItems(actionType, contentType, itemSizes);
        boolean admin = isAdmin(user);

        // Order number: ORD + yyyyMMddHHmmss + 4 random digits
        String timeStr = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMddHHmmss"));
        int rand = 1000 + new Random().nextInt(9000);
        String orderNo = "ORD" + timeStr + rand;

        boolean isFree = admin || amount.compareTo(BigDecimal.ZERO) <= 0;

        Order order = Order.builder()
                .orderNo(orderNo)
                .userId(user.getUserId())
                .userEmail(user.getEmail())
                .actionType(priceKey)
                .amount(admin ? BigDecimal.ZERO : amount)
                .status(isFree ? "paid" : "pending")
                .createdAt(LocalDateTime.now())
                .paidAt(isFree ? LocalDateTime.now() : null)
                .build();

        orderMapper.insert(order);

        return Result.ok("订单创建成功", order);
    }

    @GetMapping("/status/{orderId}")
    public Result<?> getOrderStatus(@PathVariable("orderId") String orderId) {
        UserContext.CurrentUser user = currentUser();
        if (user == null) {
            return Result.error(401, "请先登录");
        }

        Order order = orderMapper.selectById(orderId);
        if (order == null) {
            return Result.error(404, "订单不存在");
        }
        if (!canAccess(order, user)) {
            return Result.error(403, "无权查看该订单");
        }

        return Result.ok(order);
    }

    @PostMapping("/confirm")
    public Result<?> confirmPayment(@RequestBody ConfirmOrderRequest req) {
        UserContext.CurrentUser user = currentUser();
        if (user == null) {
            return Result.error(401, "请先登录");
        }
        if (req.getOrderId() == null) {
            return Result.error("缺少订单号");
        }

        Order order = orderMapper.selectById(req.getOrderId());
        if (order == null) {
            return Result.error(404, "订单不存在");
        }
        if (!canAccess(order, user)) {
            return Result.error(403, "无权操作该订单");
        }

        if ("paid".equals(order.getStatus())) {
            return Result.ok("订单已支付", order);
        }
        if (!"pending".equals(order.getStatus())) {
            return Result.error(400, "当前订单状态不支持提交支付确认");
        }

        order.setStatus("pending_review");
        order.setPaymentVoucher(req.getPaymentVoucher());
        orderMapper.updateById(order);

        return Result.ok("已提交支付确认，正在等待管理员审核核销", order);
    }

    @PostMapping("/mock-pay")
    public Result<?> mockPay(@RequestBody MockPayRequest req) {
        if (!mockPayEnabled) {
            return Result.error(403, "模拟支付通道已关闭");
        }

        UserContext.CurrentUser user = currentUser();
        if (user == null) {
            return Result.error(401, "请先登录");
        }
        if (req.getOrderId() == null) {
            return Result.error("缺少订单号");
        }

        Order order = orderMapper.selectById(req.getOrderId());
        if (order == null) {
            return Result.error(404, "订单不存在");
        }
        if (!canAccess(order, user)) {
            return Result.error(403, "无权操作该订单");
        }

        if (!"paid".equals(order.getStatus())) {
            order.setStatus("paid");
            order.setPaidAt(LocalDateTime.now());
            orderMapper.updateById(order);
        }

        return Result.ok("模拟支付成功，已解锁二维码操作", order);
    }
}
