package com.qrstudio.common;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Result<T> implements Serializable {
    private boolean success;
    private int code;
    private String message;
    private T data;

    public static <T> Result<T> ok() {
        return Result.<T>builder().success(true).code(200).message("操作成功").build();
    }

    public static <T> Result<T> ok(T data) {
        return Result.<T>builder().success(true).code(200).message("操作成功").data(data).build();
    }

    public static <T> Result<T> ok(String message, T data) {
        return Result.<T>builder().success(true).code(200).message(message).data(data).build();
    }

    public static <T> Result<T> error(String message) {
        return Result.<T>builder().success(false).code(500).message(message).build();
    }

    public static <T> Result<T> error(int code, String message) {
        return Result.<T>builder().success(false).code(code).message(message).build();
    }
}
