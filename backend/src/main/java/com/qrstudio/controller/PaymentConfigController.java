package com.qrstudio.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.qrstudio.common.Result;
import com.qrstudio.entity.PaymentConfig;
import com.qrstudio.entity.PaymentQrCode;
import com.qrstudio.entity.PricingConfig;
import com.qrstudio.mapper.PaymentConfigMapper;
import com.qrstudio.mapper.PaymentQrCodeMapper;
import com.qrstudio.mapper.PricingConfigMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/payment")
@RequiredArgsConstructor
public class PaymentConfigController {

    private final PaymentConfigMapper paymentConfigMapper;
    private final PaymentQrCodeMapper paymentQrCodeMapper;
    private final PricingConfigMapper pricingConfigMapper;

    @GetMapping("/config")
    public Result<?> getPublicPaymentConfig() {
        PaymentConfig payment = paymentConfigMapper.selectOne(null);
        List<PricingConfig> pricingList = pricingConfigMapper.selectList(null);
        // 固定按 sort_order 返回，弹窗里的渠道顺序才不会每次刷新都变（微信在前，支付宝在后）
        List<PaymentQrCode> paymentQrs = paymentQrCodeMapper.selectList(
                new LambdaQueryWrapper<PaymentQrCode>().orderByAsc(PaymentQrCode::getSortOrder)
        );

        Map<String, Object> data = new HashMap<>();
        data.put("payment", payment);
        data.put("pricing", pricingList);
        // 多渠道收款码：微信 / 支付宝各一张，前端按渠道切换
        data.put("paymentQrs", paymentQrs);

        return Result.ok(data);
    }
}
