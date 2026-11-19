package com.qrstudio.gif;

/**
 * GIF 合成参数。
 *
 * <p>所有尺度的「基准」都是 {@code outputSize}=800 的画布：{@code qrSize}、字号、边距
 * 都按 800 定义，实际渲染时统一乘 {@code outputSize/800}。这样用户改画布尺寸时
 * 构图不变，只是整体等比缩放。
 *
 * <p>{@code -1} 在这些字段里表示「自动」：{@code haloAlpha} 按底图亮度自动选，
 * {@code blur} 按 qrSize 等比换算。
 */
public class GifOptions {

    /** 基准画布边长，所有尺寸参数都以它为参照 */
    public static final int BASE_SIZE = 800;
    public static final int FPS = 25;

    // ---------- 输入 ----------
    private String backgroundUrl;
    private String qrUrl;

    // ---------- 文案 ----------
    private String caption = "截图保存，扫一扫";
    private String countdownTemplate = "等待{n}秒";

    // ---------- 时间轴 ----------
    private int waitSeconds = 3;
    private double fadeSeconds = 1.2;
    private double holdSeconds = 0.5;

    // ---------- 二维码位置与外观 ----------
    private double qrOffsetX = 0;
    /** 默认 -0.025，即 800 基准下的 -20px */
    private double qrOffsetY = -0.025;
    private int qrSize = 320;
    /**
     * 默认不透明度。
     *
     * <p>不是 brief 的 0.42 —— 在真实素材上实测 0.42/0.47 三档校验全挂，
     * 0.70 才有稳定余量。代价是二维码明显可见，但「扫不出来」的素材等于废图，
     * 这个取舍没有悬念。
     */
    private double qrOpacity = 0.70;
    /** 四角系数：低于 0.80 时定位图案在小尺寸下失守 */
    private double cornerMult = 0.85;
    /** -1 表示按底图亮度自动选 */
    private double haloAlpha = -1;
    /** -1 表示按 qrSize 等比 */
    private double blur = -1;

    // ---------- 输出 ----------
    private int outputSize = 800;
    private double targetSizeMb = 2.0;

    /** 订单号：生成时必填，预检时为空 */
    private String orderId;

    /**
     * 夹取到可行区间。
     *
     * <p>不抛异常而是静默修正：这些值都来自滑块/输入框，用户把「常驻时长」拖到 0.3 时，
     * 最好的反馈是给他 0.4 的结果，而不是弹一个错误让他重来。
     */
    public GifOptions normalize() {
        outputSize = clamp(outputSize, 480, 1080);
        waitSeconds = clamp(waitSeconds, 0, 10);
        fadeSeconds = clamp(fadeSeconds, 0.3, 3.0);
        holdSeconds = clamp(holdSeconds, 0.4, 10.0);
        qrOffsetX = clamp(qrOffsetX, -0.5, 0.5);
        qrOffsetY = clamp(qrOffsetY, -0.5, 0.5);
        qrSize = clamp(qrSize, 160, 560);
        qrOpacity = clamp(qrOpacity, 0.15, 1.0);
        cornerMult = clamp(cornerMult, 0.3, 1.0);
        haloAlpha = haloAlpha < 0 ? -1 : clamp(haloAlpha, 0.75, 1.0);
        blur = blur < 0 ? -1 : clamp(blur, 0, 3.0);
        targetSizeMb = clamp(targetSizeMb, 0.5, 8.0);
        if (caption == null) {
            caption = "";
        }
        if (countdownTemplate == null || countdownTemplate.isEmpty()) {
            countdownTemplate = "等待{n}秒";
        }
        return this;
    }

    /** 画布缩放系数：所有 800 基准尺寸乘它 */
    public double scale() {
        return outputSize / (double) BASE_SIZE;
    }

    /** 实际二维码边长（像素） */
    public int qrPixels() {
        return Math.max(16, (int) Math.round(qrSize * scale()));
    }

    /** 衬底外扩边距。留得比羽化半径宽，否则柔光会被画布边缘切出一道硬边 */
    public int haloPad() {
        return Math.max(4, (int) Math.round(qrPixels() * 0.09));
    }

    /** 衬底羽化半径。要比 brief 的 0.04 更宽，否则 1.0 不透明的衬底会显出一块白卡 */
    public double haloFeather() {
        return Math.max(10 * scale(), qrPixels() * 0.085);
    }

    /** 最终虚化半径：未显式指定时按 qrSize 等比（brief §10） */
    public double blurRadius() {
        double base = blur < 0 ? 0.85 : blur;
        return base * qrPixels() / 320.0;
    }

    public int framesCountdown() {
        return waitSeconds * FPS;
    }

    public int framesFade() {
        return Math.max(1, (int) Math.round(fadeSeconds * FPS));
    }

    /**
     * 常驻段帧数。
     *
     * <p>用 floor 而不是 round：brief 里 0.5s 对应 12 帧（0.5×25=12.5），
     * 说明参考实现是截断。跟随它，避免用户拿两侧结果对比时发现少一帧。
     */
    public int framesHold() {
        return Math.max(10, (int) Math.floor(holdSeconds * FPS));
    }

    public int totalFrames() {
        return framesCountdown() + framesFade() + framesHold();
    }

    public double durationSeconds() {
        return totalFrames() / (double) FPS;
    }

    /** 深拷贝：体积循环里要按不同画布尺寸重算，不能污染调用方的对象 */
    public GifOptions copy() {
        GifOptions o = new GifOptions();
        o.backgroundUrl = backgroundUrl;
        o.qrUrl = qrUrl;
        o.caption = caption;
        o.countdownTemplate = countdownTemplate;
        o.waitSeconds = waitSeconds;
        o.fadeSeconds = fadeSeconds;
        o.holdSeconds = holdSeconds;
        o.qrOffsetX = qrOffsetX;
        o.qrOffsetY = qrOffsetY;
        o.qrSize = qrSize;
        o.qrOpacity = qrOpacity;
        o.cornerMult = cornerMult;
        o.haloAlpha = haloAlpha;
        o.blur = blur;
        o.outputSize = outputSize;
        o.targetSizeMb = targetSizeMb;
        o.orderId = orderId;
        return o;
    }

    public static int clamp(int v, int min, int max) {
        return Math.max(min, Math.min(max, v));
    }

    public static double clamp(double v, double min, double max) {
        return Math.max(min, Math.min(max, v));
    }

    public String getBackgroundUrl() {
        return backgroundUrl;
    }

    public void setBackgroundUrl(String v) {
        this.backgroundUrl = v;
    }

    public String getQrUrl() {
        return qrUrl;
    }

    public void setQrUrl(String v) {
        this.qrUrl = v;
    }

    public String getCaption() {
        return caption;
    }

    public void setCaption(String v) {
        this.caption = v;
    }

    public String getCountdownTemplate() {
        return countdownTemplate;
    }

    public void setCountdownTemplate(String v) {
        this.countdownTemplate = v;
    }

    public int getWaitSeconds() {
        return waitSeconds;
    }

    public void setWaitSeconds(int v) {
        this.waitSeconds = v;
    }

    public double getFadeSeconds() {
        return fadeSeconds;
    }

    public void setFadeSeconds(double v) {
        this.fadeSeconds = v;
    }

    public double getHoldSeconds() {
        return holdSeconds;
    }

    public void setHoldSeconds(double v) {
        this.holdSeconds = v;
    }

    public double getQrOffsetX() {
        return qrOffsetX;
    }

    public void setQrOffsetX(double v) {
        this.qrOffsetX = v;
    }

    public double getQrOffsetY() {
        return qrOffsetY;
    }

    public void setQrOffsetY(double v) {
        this.qrOffsetY = v;
    }

    public int getQrSize() {
        return qrSize;
    }

    public void setQrSize(int v) {
        this.qrSize = v;
    }

    public double getQrOpacity() {
        return qrOpacity;
    }

    public void setQrOpacity(double v) {
        this.qrOpacity = v;
    }

    public double getCornerMult() {
        return cornerMult;
    }

    public void setCornerMult(double v) {
        this.cornerMult = v;
    }

    public double getHaloAlpha() {
        return haloAlpha;
    }

    public void setHaloAlpha(double v) {
        this.haloAlpha = v;
    }

    public double getBlur() {
        return blur;
    }

    public void setBlur(double v) {
        this.blur = v;
    }

    public int getOutputSize() {
        return outputSize;
    }

    public void setOutputSize(int v) {
        this.outputSize = v;
    }

    public double getTargetSizeMb() {
        return targetSizeMb;
    }

    public void setTargetSizeMb(double v) {
        this.targetSizeMb = v;
    }

    public String getOrderId() {
        return orderId;
    }

    public void setOrderId(String v) {
        this.orderId = v;
    }
}
