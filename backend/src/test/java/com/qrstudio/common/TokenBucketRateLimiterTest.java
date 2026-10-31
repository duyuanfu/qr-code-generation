package com.qrstudio.common;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 令牌桶限流器的行为契约。
 *
 * <p>这几个断言是上传防刷的地基，改动 {@link TokenBucketRateLimiter} 时必须保证全绿。
 */
class TokenBucketRateLimiterTest {

    @Test
    @DisplayName("容量内的请求全部放行，超出的被拒绝")
    void allowsUpToCapacityThenRejects() {
        TokenBucketRateLimiter limiter = new TokenBucketRateLimiter(30, 60);

        int allowed = 0;
        for (int i = 0; i < 30; i++) {
            if (limiter.tryAcquire("user:a").allowed()) {
                allowed++;
            }
        }

        assertEquals(30, allowed, "容量 30 应全部放行");
        assertFalse(limiter.tryAcquire("user:a").allowed(), "第 31 次应被拒绝");
    }

    @Test
    @DisplayName("被拒时给出的等待时间与补充速率一致")
    void reportsRetryAfterInSeconds() {
        // 30 个 / 60 秒 => 0.5 个/秒，缺一个令牌约需 2 秒
        TokenBucketRateLimiter limiter = new TokenBucketRateLimiter(30, 60);
        for (int i = 0; i < 30; i++) {
            limiter.tryAcquire("user:a");
        }

        long retryAfter = limiter.tryAcquire("user:a").retryAfterSeconds();
        assertTrue(retryAfter >= 1 && retryAfter <= 3, "重试等待应为 1~3 秒，实际 " + retryAfter);
    }

    @Test
    @DisplayName("不同 key 各自计数，互不影响")
    void isolatesKeys() {
        TokenBucketRateLimiter limiter = new TokenBucketRateLimiter(2, 60);

        assertTrue(limiter.tryAcquire("user:a").allowed());
        assertTrue(limiter.tryAcquire("user:a").allowed());
        assertFalse(limiter.tryAcquire("user:a").allowed(), "a 已耗尽");

        assertTrue(limiter.tryAcquire("user:b").allowed(), "b 不应受 a 影响");
    }

    @Test
    @DisplayName("空 key 不参与限流，直接放行")
    void ignoresBlankKey() {
        TokenBucketRateLimiter limiter = new TokenBucketRateLimiter(1, 60);

        assertTrue(limiter.tryAcquire(null).allowed());
        assertTrue(limiter.tryAcquire("").allowed());
    }

    @Test
    @DisplayName("令牌按速率补充，静置后可再次通过")
    void refillsOverTime() throws InterruptedException {
        // 2 个 / 1 秒 => 每 500ms 补一个
        TokenBucketRateLimiter limiter = new TokenBucketRateLimiter(2, 1);
        limiter.tryAcquire("k");
        limiter.tryAcquire("k");
        assertFalse(limiter.tryAcquire("k").allowed(), "打空后应立即拒绝");

        Thread.sleep(600);
        assertTrue(limiter.tryAcquire("k").allowed(), "静置 600ms 后应补回至少一个令牌");
    }
}
