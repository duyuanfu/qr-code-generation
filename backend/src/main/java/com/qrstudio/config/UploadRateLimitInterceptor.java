package com.qrstudio.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.qrstudio.common.Result;
import com.qrstudio.common.TokenBucketRateLimiter;
import com.qrstudio.common.UploadRateLimiter;
import com.qrstudio.common.UserContext;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * 上传接口限流。必须注册在 {@link AuthInterceptor} 之后，
 * 因为用户维度的 key 依赖它写入的 {@link UserContext}。
 */
@Component
@RequiredArgsConstructor
public class UploadRateLimitInterceptor implements HandlerInterceptor {

    private final UploadRateLimiter uploadRateLimiter;

    private final ObjectMapper objectMapper;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return true;
        }

        UserContext.CurrentUser current = UserContext.get();
        String userId = current != null && current.getUserId() != null ? current.getUserId() : "anonymous";

        TokenBucketRateLimiter.Decision decision = uploadRateLimiter.check(userId, resolveClientIp(request));
        if (decision.allowed()) {
            return true;
        }

        long retryAfter = decision.retryAfterSeconds();
        response.setHeader("Retry-After", String.valueOf(retryAfter));
        response.setStatus(429);
        response.setContentType("application/json;charset=UTF-8");

        // 上传接口沿用 { success, error } 的裸结构（前端 ContentForm 依赖它），
        // 这里保持同构，避免前端要为错误分支写两套解析。
        Result<?> body = Result.error(429, "上传过于频繁，请 " + retryAfter + " 秒后再试");
        response.getWriter().write(objectMapper.writeValueAsString(body));
        return false;
    }

    /**
     * 取真实客户端 IP。经 Next.js rewrites 转发后 remoteAddr 恒为前端服务器，
     * 因此优先读 X-Forwarded-For 的第一段。
     */
    private String resolveClientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            String first = forwarded.split(",")[0].trim();
            if (!first.isEmpty()) {
                return first;
            }
        }
        String realIp = request.getHeader("X-Real-IP");
        if (realIp != null && !realIp.isBlank()) {
            return realIp.trim();
        }
        return request.getRemoteAddr();
    }
}
