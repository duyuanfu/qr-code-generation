package com.qrstudio.common;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 全局异常出口。
 *
 * <p>重点是把「上传超限」变成浏览器可读的 413 JSON。
 * 默认情况下 Spring 抛 {@link MaxUploadSizeExceededException} 时返回的是 Whitelabel 错误页，
 * 而前端 setUpload 流式上传中途被拒时更可能直接拿到连接重置——
 * 配合 application.yml 里的 {@code server.tomcat.max-swallow-size: -1}，
 * 浏览器才能稳定读到下面这段 JSON 并给出人话提示。
 */
@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    @Value("${app.upload.max-file-size-mb:500}")
    private long maxFileSizeMb;

    private Map<String, Object> body(int code, String message) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("success", false);
        body.put("code", code);
        // error 与 message 同时给：前端上传组件读 error，通用封装读 message
        body.put("error", message);
        body.put("message", message);
        return body;
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<Map<String, Object>> handleMaxUploadSize(MaxUploadSizeExceededException e) {
        String message = "文件超过 " + maxFileSizeMb + "MB 上限，请压缩视频或拆分后重试";
        log.warn("上传被拒（超过大小限制）: {}", e.getMessage());
        return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE).body(body(413, message));
    }

    @ExceptionHandler(MultipartException.class)
    public ResponseEntity<Map<String, Object>> handleMultipart(MultipartException e) {
        log.warn("上传解析失败: {}", e.getMessage());
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(body(400, "文件传输中断或格式异常，请重试"));
    }

    @ExceptionHandler({MissingServletRequestPartException.class, MissingServletRequestParameterException.class})
    public ResponseEntity<Map<String, Object>> handleMissingPart(Exception e) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(body(400, "缺少上传文件，请重新选择"));
    }
}
