package com.qrstudio.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.qrstudio.common.Result;
import com.qrstudio.entity.DynamicQr;
import com.qrstudio.entity.Order;
import com.qrstudio.entity.PaymentConfig;
import com.qrstudio.entity.PaymentQrCode;
import com.qrstudio.entity.PricingConfig;
import com.qrstudio.entity.User;
import com.qrstudio.mapper.DynamicQrMapper;
import com.qrstudio.mapper.OrderMapper;
import com.qrstudio.mapper.PaymentConfigMapper;
import com.qrstudio.mapper.PaymentQrCodeMapper;
import com.qrstudio.mapper.PricingConfigMapper;
import com.qrstudio.mapper.UserMapper;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminController {

    private final UserMapper userMapper;
    private final PricingConfigMapper pricingConfigMapper;
    private final PaymentConfigMapper paymentConfigMapper;
    private final PaymentQrCodeMapper paymentQrCodeMapper;
    private final OrderMapper orderMapper;
    private final DynamicQrMapper dynamicQrMapper;

    // ================= 1. 用户管理 =================
    @GetMapping("/users")
    public Result<List<User>> listUsers() {
        List<User> users = userMapper.selectList(
                new LambdaQueryWrapper<User>().orderByDesc(User::getCreatedAt)
        );
        // Mask passwords
        users.forEach(u -> u.setPassword(null));
        return Result.ok(users);
    }

    @PostMapping("/users/{id}/toggle-status")
    public Result<?> toggleUserStatus(@PathVariable("id") String userId) {
        User user = userMapper.selectById(userId);
        if (user == null) {
            return Result.error(404, "用户不存在");
        }
        if ("admin".equals(user.getRole())) {
            return Result.error(400, "不能禁用超级管理员账号");
        }

        user.setStatus("active".equals(user.getStatus()) ? "disabled" : "active");
        user.setUpdatedAt(LocalDateTime.now());
        userMapper.updateById(user);

        return Result.ok("账号状态已切换为: " + user.getStatus(), user);
    }

    @Data
    public static class UpdateRoleRequest {
        private String role;
    }

    @PostMapping("/users/{id}/role")
    public Result<?> updateUserRole(@PathVariable("id") String userId, @RequestBody UpdateRoleRequest req) {
        User user = userMapper.selectById(userId);
        if (user == null) {
            return Result.error(404, "用户不存在");
        }

        user.setRole(req.getRole());
        user.setUpdatedAt(LocalDateTime.now());
        userMapper.updateById(user);

        return Result.ok("用户角色已更新", user);
    }

    // ================= 2. 价格配置管理 =================
    @GetMapping("/pricing")
    public Result<List<PricingConfig>> listPricing() {
        return Result.ok(pricingConfigMapper.selectList(
                new LambdaQueryWrapper<PricingConfig>()
                        .orderByAsc(PricingConfig::getSortOrder)
                        .orderByAsc(PricingConfig::getItemKey)
        ));
    }

    @Data
    public static class UpdatePricingRequest {
        private String id;
        private BigDecimal price;
        private Integer enabled;
        /** 基础价内含体积（MB） */
        private Integer includedSizeMb;
        /** 每超出一档的体积（MB） */
        private Integer stepSizeMb;
        /** 每档加价 */
        private BigDecimal stepPrice;
        /** 服务有效期（月），0 表示长期 */
        private Integer validMonths;
        /** 计价方式：1 = 按件累加，0 = 按总体积 */
        private Integer perItem;
    }

    @PostMapping("/pricing")
    public Result<?> updatePricing(@RequestBody UpdatePricingRequest req) {
        PricingConfig config = pricingConfigMapper.selectById(req.getId());
        if (config == null) {
            return Result.error(404, "定价项不存在");
        }

        if (req.getPrice() != null) {
            if (req.getPrice().compareTo(BigDecimal.ZERO) < 0) {
                return Result.error("价格不能为负数");
            }
            config.setPrice(req.getPrice());
        }
        if (req.getEnabled() != null) config.setEnabled(req.getEnabled());
        if (req.getIncludedSizeMb() != null) config.setIncludedSizeMb(Math.max(0, req.getIncludedSizeMb()));
        if (req.getStepSizeMb() != null) config.setStepSizeMb(Math.max(0, req.getStepSizeMb()));
        if (req.getStepPrice() != null) config.setStepPrice(req.getStepPrice().max(BigDecimal.ZERO));
        if (req.getValidMonths() != null) config.setValidMonths(Math.max(0, req.getValidMonths()));
        if (req.getPerItem() != null) config.setPerItem(req.getPerItem() == 1 ? 1 : 0);
        config.setUpdatedAt(LocalDateTime.now());
        pricingConfigMapper.updateById(config);

        return Result.ok("价格已保存生效", config);
    }

    // ================= 3. 收款二维码与提示配置 =================
    @GetMapping("/payment-config")
    public Result<PaymentConfig> getPaymentConfig() {
        PaymentConfig config = paymentConfigMapper.selectOne(null);
        return Result.ok(config);
    }

    @Data
    public static class UpdatePaymentConfigRequest {
        private String qrImageUrl;
        private String qrType;
        private String noticeText;
        private Integer enabled;
    }

    @PostMapping("/payment-config")
    public Result<?> updatePaymentConfig(@RequestBody UpdatePaymentConfigRequest req) {
        PaymentConfig config = paymentConfigMapper.selectOne(null);
        if (config == null) {
            config = PaymentConfig.builder()
                    .qrImageUrl(req.getQrImageUrl())
                    .qrType(req.getQrType() != null ? req.getQrType() : "all")
                    .noticeText(req.getNoticeText())
                    .enabled(req.getEnabled() != null ? req.getEnabled() : 1)
                    .updatedAt(LocalDateTime.now())
                    .build();
            paymentConfigMapper.insert(config);
        } else {
            if (req.getQrImageUrl() != null) config.setQrImageUrl(req.getQrImageUrl());
            if (req.getQrType() != null) config.setQrType(req.getQrType());
            if (req.getNoticeText() != null) config.setNoticeText(req.getNoticeText());
            if (req.getEnabled() != null) config.setEnabled(req.getEnabled());
            config.setUpdatedAt(LocalDateTime.now());
            paymentConfigMapper.updateById(config);
        }

        return Result.ok("收款配置更新成功", config);
    }

    // ================= 4. 多渠道收款码（微信 / 支付宝） =================
    @GetMapping("/payment-qr-codes")
    public Result<List<PaymentQrCode>> listPaymentQrCodes() {
        return Result.ok(paymentQrCodeMapper.selectList(
                new LambdaQueryWrapper<PaymentQrCode>().orderByAsc(PaymentQrCode::getSortOrder)
        ));
    }

    @Data
    public static class UpdatePaymentQrCodeRequest {
        private String channel;
        private String imageUrl;
        private Integer enabled;
    }

    @PostMapping("/payment-qr-codes")
    public Result<?> updatePaymentQrCode(@RequestBody UpdatePaymentQrCodeRequest req) {
        if (req.getChannel() == null || req.getChannel().isBlank()) {
            return Result.error("缺少收款渠道标识");
        }

        PaymentQrCode code = paymentQrCodeMapper.selectOne(
                new LambdaQueryWrapper<PaymentQrCode>().eq(PaymentQrCode::getChannel, req.getChannel())
        );
        if (code == null) {
            return Result.error(404, "收款渠道不存在: " + req.getChannel());
        }

        if (req.getImageUrl() != null) code.setImageUrl(req.getImageUrl());
        if (req.getEnabled() != null) code.setEnabled(req.getEnabled());
        code.setUpdatedAt(LocalDateTime.now());
        paymentQrCodeMapper.updateById(code);

        return Result.ok(code.getChannelName() + "收款码已保存", code);
    }

    // ================= 5. 订单审核中心 =================
    @GetMapping("/orders")
    public Result<List<Order>> listOrders() {
        List<Order> orders = orderMapper.selectList(
                new LambdaQueryWrapper<Order>().orderByDesc(Order::getCreatedAt)
        );
        return Result.ok(orders);
    }

    @PostMapping("/orders/{id}/approve")
    public Result<?> approveOrder(@PathVariable("id") String orderId) {
        Order order = orderMapper.selectById(orderId);
        if (order == null) {
            return Result.error(404, "订单不存在");
        }

        // 只有待支付/待审核的订单需要审核，已核销订单不可回退，避免重新解锁
        if ("used".equals(order.getStatus()) || "paid".equals(order.getStatus())) {
            return Result.error(400, "该订单已处理，无需再次审核");
        }

        order.setStatus("paid");
        order.setPaidAt(LocalDateTime.now());
        orderMapper.updateById(order);

        return Result.ok("订单已审核通过并放行", order);
    }

    // ================= 6. 动态活码过期提醒 =================
    /**
     * 列出所有动态活码的服务期状态，供后台「过期提醒」面板使用。
     *
     * <p>为什么把判定放在服务端：剩余天数必须用**服务器时间**算。客户端时区/时钟一旦偏差，
     * 就会出现「后台显示还有 1 天、落地页已经提示到期」的对不上。这里统一用 {@link LocalDateTime#now()}，
     * 前端只负责展示和分桶。
     *
     * <p>状态口径：
     * <ul>
     *   <li>{@code permanent} —— {@code expires_at} 为空，长期有效（静态码不落这张表，不会出现）</li>
     *   <li>{@code expired} —— 已过期（daysLeft &lt; 0）</li>
     *   <li>{@code expiring} —— 7 天内到期（0 ≤ daysLeft ≤ 7），需要用颜色提醒运营跟进</li>
     *   <li>{@code active} —— 仍在服务期内</li>
     * </ul>
     */
    @GetMapping("/dynamic-qrs")
    public Result<?> listDynamicQrs() {
        // 只取面板要显示的列。media_urls / style_config 是 LONGTEXT，
        // 一条活码可能几 MB —— 为了算个剩余天数把整表的大字段拖进内存不值当。
        List<DynamicQr> qrs = dynamicQrMapper.selectList(
                new LambdaQueryWrapper<DynamicQr>()
                        .select(DynamicQr::getId, DynamicQr::getShortCode, DynamicQr::getContentType,
                                DynamicQr::getTitle, DynamicQr::getUserId,
                                DynamicQr::getExpiresAt, DynamicQr::getCreatedAt)
                        .orderByAsc(DynamicQr::getExpiresAt)
        );

        // 一次性把归属用户捞出来做成字典，避免 N+1 查询。
        // 只 select id + email：没理由为了显示邮箱把整表的口令哈希读进内存。
        Map<String, String> emailOf = new HashMap<>();
        for (User u : userMapper.selectList(
                new LambdaQueryWrapper<User>().select(User::getId, User::getEmail))) {
            emailOf.put(u.getId(), u.getEmail());
        }

        LocalDateTime now = LocalDateTime.now();
        List<ExpiringQrView> views = new ArrayList<>(qrs.size());
        int permanent = 0;
        int expired = 0;
        int within7 = 0;
        int within30 = 0;

        for (DynamicQr qr : qrs) {
            ExpiringQrView v = new ExpiringQrView();
            v.setId(qr.getId());
            v.setShortCode(qr.getShortCode());
            v.setContentType(qr.getContentType());
            v.setTitle(qr.getTitle());
            v.setOwnerEmail(emailOf.get(qr.getUserId()));
            v.setExpiresAt(qr.getExpiresAt());
            v.setCreatedAt(qr.getCreatedAt());

            if (qr.getExpiresAt() == null) {
                v.setStatus("permanent");
                // 长期有效没有「剩余天数」这回事，给 null 而不是哨兵值，
                // 让前端不可能把 9223372036854775807 渲染成「还有 xx 天」
                v.setDaysLeft(null);
                permanent++;
            } else {
                long days = ChronoUnit.DAYS.between(now, qr.getExpiresAt());
                // between() 按整天截断，当天到期会得到 0 —— 「今天到期」比「已过期」更贴近直觉
                v.setDaysLeft(days);
                if (days < 0) {
                    v.setStatus("expired");
                    expired++;
                } else if (days <= 7) {
                    v.setStatus("expiring");
                    within7++;
                } else {
                    v.setStatus("active");
                }
                if (days >= 0 && days <= 30) {
                    within30++;
                }
            }
            views.add(v);
        }

        Map<String, Object> stats = new HashMap<>();
        stats.put("total", qrs.size());
        stats.put("permanent", permanent);
        stats.put("expired", expired);
        stats.put("within7", within7);
        stats.put("within30", within30);

        Map<String, Object> data = new HashMap<>();
        data.put("items", views);
        data.put("stats", stats);
        data.put("serverTime", now);
        return Result.ok(data);
    }

    @Data
    public static class ExpiringQrView {
        private String id;
        private String shortCode;
        private String contentType;
        private String title;
        private String ownerEmail;
        private LocalDateTime expiresAt;
        private LocalDateTime createdAt;
        /** 剩余天数：负数=已过期天数，0=今天到期；长期有效为 null */
        private Long daysLeft;
        /** permanent | expired | expiring | active */
        private String status;
    }
}
