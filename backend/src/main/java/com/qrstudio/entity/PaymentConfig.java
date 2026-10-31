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

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@TableName("payment_configs")
public class PaymentConfig implements Serializable {
    @TableId(type = IdType.ASSIGN_ID)
    private String id;
    private String qrImageUrl;
    private String qrType; // "wechat" | "alipay" | "all"
    private String noticeText;
    private Integer enabled; // 1: enabled, 0: disabled
    private LocalDateTime updatedAt;
}
