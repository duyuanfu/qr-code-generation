package com.qrstudio.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.qrstudio.entity.PricingConfig;
import com.qrstudio.mapper.PricingConfigMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;

/**
 * 计费项解析。
 *
 * <p>定价支持「按二维码内容类型细分配置」：
 * <ul>
 *   <li>细分配置的 item_key 形如 {@code dynamic_qr.video}；</li>
 *   <li>未配置细分项时，回退到 {@code dynamic_qr} 通用价，保证老数据与线上行为不中断。</li>
 * </ul>
 * 订单落库时写入的是**实际命中的 item_key**，这样"用便宜的网址二维码订单去解锁视频活码"会被拒绝。
 */
@Service
@RequiredArgsConstructor
public class PricingService {

    public static final String ACTION_DYNAMIC = "dynamic_qr";
    public static final String ACTION_EXPORT = "static_export";

    private final PricingConfigMapper pricingConfigMapper;

    /** 拼装细分定价键，如 dynamic_qr + video -> dynamic_qr.video */
    public static String keyFor(String actionType, String contentType) {
        if (contentType == null || contentType.isBlank()) {
            return actionType;
        }
        return actionType + "." + contentType.trim().toLowerCase();
    }

    /** 命中细分定价行；没有配置则回退到通用行；都没有返回 null */
    public PricingConfig resolve(String actionType, String contentType) {
        String specific = keyFor(actionType, contentType);
        PricingConfig config = pricingConfigMapper.selectOne(
                new LambdaQueryWrapper<PricingConfig>().eq(PricingConfig::getItemKey, specific)
        );
        if (config != null) {
            return config;
        }
        return pricingConfigMapper.selectOne(
                new LambdaQueryWrapper<PricingConfig>().eq(PricingConfig::getItemKey, actionType)
        );
    }

    /** 该内容类型是否仍在收费（关闭开关或价格 0 元都视为免费） */
    public boolean isPaywallActive(String actionType, String contentType) {
        PricingConfig config = resolve(actionType, contentType);
        return config != null
                && config.getEnabled() != null && config.getEnabled() == 1
                && config.getPrice() != null
                && config.getPrice().compareTo(BigDecimal.ZERO) > 0;
    }

    /** 实际应付金额（免费时为 0，无附件时按 1 件算） */
    public BigDecimal amountFor(String actionType, String contentType) {
        return amountForItems(actionType, contentType, java.util.List.of());
    }

    /**
     * 按「本次托管的每个文件」计算应付金额。
     *
     * <p>两种计价方式，由定价行的 {@code perItem} 决定：
     * <ul>
     *   <li><b>按件累加</b>（perItem=1）：每个文件各收一次基础价，且体积阶梯也按单件算。
     *       3 张 2MB 图片 = 3 × ¥4 = ¥12，而不是 6MB 合计只收 ¥4。</li>
     *   <li><b>按总体积</b>（perItem=0）：所有文件体积相加后算一份（历史行为）。</li>
     * </ul>
     *
     * @param itemSizes 每个文件的真实字节数（服务端 stat 磁盘得到，顺序与文件列表一致）
     */
    public BigDecimal amountForItems(String actionType, String contentType, java.util.List<Long> itemSizes) {
        if (!isPaywallActive(actionType, contentType)) {
            return BigDecimal.ZERO;
        }
        PricingConfig config = resolve(actionType, contentType);
        if (config == null) {
            return BigDecimal.ZERO;
        }

        boolean perItem = config.getPerItem() != null && config.getPerItem() == 1;

        if (perItem) {
            // 没有附件（如纯链接）也要收一份基础价
            int count = Math.max(1, itemSizes == null ? 0 : itemSizes.size());
            BigDecimal total = BigDecimal.ZERO;
            for (int i = 0; i < count; i++) {
                long bytes = (itemSizes != null && i < itemSizes.size()) ? itemSizes.get(i) : 0L;
                total = total.add(tierPrice(config, bytes));
            }
            return total;
        }

        long sum = itemSizes == null ? 0L : itemSizes.stream().mapToLong(Long::longValue).sum();
        return tierPrice(config, sum);
    }

    /**
     * 单件价格：基础价含 {@code includedSizeMb}，超出部分每满 {@code stepSizeMb} 加收 {@code stepPrice}，
     * 不足一档按一档计。includedSizeMb / stepSizeMb 为 0 时表示不按体积计费。
     */
    private BigDecimal tierPrice(PricingConfig config, long bytes) {
        BigDecimal base = config.getPrice();

        int includedMb = config.getIncludedSizeMb() == null ? 0 : config.getIncludedSizeMb();
        int stepMb = config.getStepSizeMb() == null ? 0 : config.getStepSizeMb();
        BigDecimal stepPrice = config.getStepPrice() == null ? BigDecimal.ZERO : config.getStepPrice();

        if (includedMb <= 0 || stepMb <= 0 || stepPrice.compareTo(BigDecimal.ZERO) <= 0 || bytes <= 0) {
            return base;
        }

        double mb = bytes / 1024.0 / 1024.0;
        if (mb <= includedMb) {
            return base;
        }

        long steps = (long) Math.ceil((mb - includedMb) / stepMb);
        return base.add(stepPrice.multiply(BigDecimal.valueOf(steps)));
    }

    /** 命中定价项的服务有效期（月）；0 表示永久 */
    public int validMonthsFor(String actionType, String contentType) {
        PricingConfig config = resolve(actionType, contentType);
        if (config == null || config.getValidMonths() == null) {
            return 0;
        }
        return Math.max(0, config.getValidMonths());
    }

    /**
     * 订单是否解锁了当前这次操作。
     *
     * @param orderActionType   订单落库的 action_type（可能是细分键，也可能是历史通用键）
     * @param expectedActionKey 本次操作解析出的定价键
     */
    public boolean matchesOrder(String orderActionType, String expectedActionKey, String actionType) {
        if (orderActionType == null) return false;
        return orderActionType.equals(expectedActionKey) || orderActionType.equals(actionType);
    }
}
