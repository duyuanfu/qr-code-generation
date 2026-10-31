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
@TableName("pricing_configs")
public class PricingConfig implements Serializable {
    @TableId(type = IdType.ASSIGN_ID)
    private String id;
    private String itemKey; // "dynamic_qr" | "dynamic_qr.video" | "static_export"
    private String itemName;
    private BigDecimal price;
    private Integer enabled; // 1: enabled, 0: disabled
    /** 基础价内含的体积（MB），超出部分按 stepSizeMb 阶梯加价；0 表示不按体积计费 */
    private Integer includedSizeMb;
    /** 每超出一个 stepSizeMb 加收 stepPrice */
    private Integer stepSizeMb;
    private BigDecimal stepPrice;
    /** 服务有效期（月），0 表示永久 */
    private Integer validMonths;
    /**
     * 计价方式：1 = 按件累加（每个文件各算一次基础价），0 = 按总体积算一份。
     * 图片/PDF/文件/视频都是「一个活码托管 N 个文件」，N 个文件就是 N 份成本。
     */
    private Integer perItem;
    /** 后台展示顺序：按二维码类型从轻到重排列 */
    private Integer sortOrder;
    private LocalDateTime updatedAt;
}
