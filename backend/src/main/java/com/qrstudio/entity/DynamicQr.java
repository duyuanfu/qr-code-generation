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
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
