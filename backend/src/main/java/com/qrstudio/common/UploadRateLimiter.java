package com.qrstudio.common;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * 上传接口的限流策略：用户维度 + IP 维度双桶。
 *
 * <p>只靠 IP 不够——同一个出口 IP 后面可能坐着整个办公室的正常用户；
 * 只靠用户也不够——注册成本太低，换号即可绕过。两个维度任一超限即拒绝，
 * 既防「单个账号刷爆磁盘」，也防「同 IP 批量注册轮询」。
 */
@Component
public class UploadRateLimiter {

    private final TokenBucketRateLimiter perUser;

    private final TokenBucketRateLimiter perIp;

    public UploadRateLimiter(
            @Value("${app.upload.rate-limit.user-per-minute:30}") int userPerMinute,
            @Value("${app.upload.rate-limit.ip-per-minute:60}") int ipPerMinute) {
        this.perUser = new TokenBucketRateLimiter(userPerMinute, 60);
        this.perIp = new TokenBucketRateLimiter(ipPerMinute, 60);
    }

    /**
     * 两个维度都取到令牌才放行；返回更严格的等待时间。
     */
    public TokenBucketRateLimiter.Decision check(String userId, String ip) {
        TokenBucketRateLimiter.Decision user = perUser.tryAcquire("user:" + userId);
        TokenBucketRateLimiter.Decision address = perIp.tryAcquire("ip:" + ip);

        if (user.allowed() && address.allowed()) {
            return TokenBucketRateLimiter.Decision.grant();
        }

        long wait = Math.max(
                user.allowed() ? 0 : user.retryAfterSeconds(),
                address.allowed() ? 0 : address.retryAfterSeconds());
        return TokenBucketRateLimiter.Decision.reject(wait);
    }
}
