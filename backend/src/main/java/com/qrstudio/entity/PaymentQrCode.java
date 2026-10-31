package com.qrstudio.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.time.LocalDateTime;

/** 收款渠道二维码（微信 / 支付宝各一条） */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@TableName("payment_qr_codes")
public class PaymentQrCode implements Serializable {
    @TableId(type = IdType.ASSIGN_ID)
    private String id;
    /** wechat | alipay */
    private String channel;
    private String channelName;
    private String imageUrl;
    private Integer enabled;
    private Integer sortOrder;
    private LocalDateTime updatedAt;
}
