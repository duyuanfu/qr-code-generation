package com.qrstudio.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@TableName("orders")
public class Order implements Serializable {
    @TableId(type = IdType.ASSIGN_ID)
    private String id;
    private String orderNo;
    private String userId;
    private String userEmail;
    private String actionType; // "dynamic_qr" | "static_export"
    private BigDecimal amount;
    private String status; // "pending" | "pending_review" | "paid" | "used" | "expired"
    private String paymentVoucher;
    /** 一次性交付物的产物地址（GIF 导出），null 表示还没产出过 */
    private String resultUrl;
    private LocalDateTime createdAt;
    private LocalDateTime paidAt;
}
