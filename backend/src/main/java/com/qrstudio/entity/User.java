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
@TableName("users")
public class User implements Serializable {
    @TableId(type = IdType.ASSIGN_ID)
    private String id;
    private String email;
    private String password;
    private String role; // "admin" or "user"
    private String status; // "active" or "disabled"
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
