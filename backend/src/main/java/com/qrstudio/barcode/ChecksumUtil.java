package com.qrstudio.barcode;

/**
 * GS1 校验位（mod-10）。
 *
 * <p>EAN-13 / EAN-8 / UPC-A 共用同一算法：**从最右一位开始向左，权重 3、1 交替**，
 * 加权和补到 10 的整数倍，差额就是校验位。
 *
 * <p>实现细节：从右往左的权重正好等于「从左往右的最后一位权重为 3」，
 * 所以循环里用 {@code weight = 4 - weight} 在 3 与 1 之间翻转即可。
 */
public final class ChecksumUtil {

    private ChecksumUtil() {
    }

    /**
     * 计算校验位。
     *
     * @param data 不含校验位的纯数字串
     * @return 0~9
     */
    public static int gs1CheckDigit(CharSequence data) {
        int sum = 0;
        int weight = 3;
        for (int i = data.length() - 1; i >= 0; i--) {
            char c = data.charAt(i);
            if (c < '0' || c > '9') {
                throw new IllegalArgumentException("校验位只能基于数字计算，遇到非法字符: " + c);
            }
            sum += (c - '0') * weight;
            weight = 4 - weight;
        }
        return (10 - sum % 10) % 10;
    }

    /** 完整码（含末位校验位）是否自洽 */
    public static boolean isValidGs1(CharSequence full) {
        if (full == null || full.length() < 2) {
            return false;
        }
        CharSequence data = full.subSequence(0, full.length() - 1);
        return (full.charAt(full.length() - 1) - '0') == gs1CheckDigit(data);
    }
}
