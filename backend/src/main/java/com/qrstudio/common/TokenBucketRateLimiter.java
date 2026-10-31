package com.qrstudio.common;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 进程内令牌桶限流器（零外部依赖）。
 *
 * <p>设计取舍：
 * <ul>
 *   <li>单机内存实现，够用且不需要引入 Redis；将来多实例部署时把 {@link #tryAcquire} 换成
 *       Redis + Lua 即可，接口形态保持不变。</li>
 *   <li>按 key 分桶，桶内用 {@code synchronized} 而非原子类——竞争只发生在同一个 key 上，
 *       粒度足够细，且能保证「读令牌 + 扣令牌」的原子性。</li>
 *   <li>每 {@value #CLEANUP_EVERY_OPS} 次访问清理一次空闲桶，避免 key 爆炸导致内存泄漏。</li>
 * </ul>
 */
public class TokenBucketRateLimiter {

    /** 每隔多少次访问触发一次空闲桶回收 */
    private static final long CLEANUP_EVERY_OPS = 1024;

    /** 桶空闲多久后可以被回收 */
    private static final long IDLE_NANOS = 10L * 60 * 1_000_000_000L;

    /** 桶容量，也是允许的突发上限 */
    private final int capacity;

    /** 每秒补充的令牌数 */
    private final double refillPerSecond;

    private final ConcurrentHashMap<String, Bucket> buckets = new ConcurrentHashMap<>();

    private final AtomicLong ops = new AtomicLong();

    /**
     * @param capacity      桶容量（允许的突发请求数）
     * @param windowSeconds 匀速补满一桶所需的秒数，例如 30/60 表示每分钟 30 次
     */
    public TokenBucketRateLimiter(int capacity, int windowSeconds) {
        this.capacity = Math.max(1, capacity);
        this.refillPerSecond = (double) this.capacity / Math.max(1, windowSeconds);
    }

    /**
     * 尝试为 key 取一个令牌。
     *
     * @return 放行时 {@code allowed=true}；否则给出建议的 retryAfterSeconds
     */
    public Decision tryAcquire(String key) {
        if (key == null || key.isEmpty()) {
            return Decision.grant();
        }

        Bucket bucket = buckets.computeIfAbsent(key, k -> new Bucket(capacity));
        Decision decision = bucket.tryAcquire(capacity, refillPerSecond);

        if (ops.incrementAndGet() % CLEANUP_EVERY_OPS == 0) {
            cleanup();
        }
        return decision;
    }

    private void cleanup() {
        buckets.entrySet().removeIf(e -> e.getValue().isIdle());
    }

    /** 限流判定结果 */
    public record Decision(boolean allowed, long retryAfterSeconds) {
        public static Decision grant() {
            return new Decision(true, 0);
        }

        public static Decision reject(long retryAfterSeconds) {
            return new Decision(false, Math.max(1, retryAfterSeconds));
        }
    }

    private static final class Bucket {

        private double tokens;
        private long lastRefillNanos;

        Bucket(int capacity) {
            this.tokens = capacity;
            this.lastRefillNanos = System.nanoTime();
        }

        synchronized Decision tryAcquire(int capacity, double refillPerSecond) {
            refill(capacity, refillPerSecond);

            if (tokens >= 1.0d) {
                tokens -= 1.0d;
                return Decision.grant();
            }

            double deficit = 1.0d - tokens;
            long waitSeconds = (long) Math.ceil(deficit / refillPerSecond);
            return Decision.reject(waitSeconds);
        }

        private void refill(int capacity, double refillPerSecond) {
            long now = System.nanoTime();
            double elapsed = (now - lastRefillNanos) / 1_000_000_000.0d;
            if (elapsed > 0) {
                tokens = Math.min(capacity, tokens + elapsed * refillPerSecond);
                lastRefillNanos = now;
            }
        }

        synchronized boolean isIdle() {
            return System.nanoTime() - lastRefillNanos > IDLE_NANOS;
        }
    }
}
