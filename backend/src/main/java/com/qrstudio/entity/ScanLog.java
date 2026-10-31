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
@TableName("scan_logs")
public class ScanLog implements Serializable {
    @TableId(type = IdType.ASSIGN_ID)
    private String id;
    private String qrId;
    private String shortCode;
    private String ip;
    private String userAgent;
    private String device;
    private LocalDateTime scannedAt;
}
