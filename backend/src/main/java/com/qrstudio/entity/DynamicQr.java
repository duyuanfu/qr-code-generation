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
@TableName("dynamic_qrs")
public class DynamicQr implements Serializable {
    @TableId(type = IdType.ASSIGN_ID)
    private String id;
    private String shortCode;
    private String userId;
    private String contentType; // "image" | "video" | "pdf" | "file"
    private String title;
    private String description;
    private String mediaUrls; // JSON string
    private String styleConfig; // JSON string
    /** 服务到期时间：由下单时命中的定价项 validMonths 推算，null 表示长期有效 */
    private LocalDateTime expiresAt;
    /**
     * 落地页顶部品牌栏是否展示：1 展示（默认），0 隐藏。
     *
     * <p>隐藏后页面顶部不再有 logo 与回首页入口 —— 客户要「干净页面」时用。
     * 注意隐藏同时要去掉 {@code pt-landing-header} 的留白，否则顶部会空一条。
     */
    private Integer showBrandHeader;
    /** 软删除时间：非空表示已进回收站，落地页返回 404，后台列表归入「回收站」 */
    private LocalDateTime deletedAt;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
