package com.qrstudio.barcode;

/**
 * 内容规范化与校验。
 *
 * <p>原则：**错误提示要说「应该填什么」，而不是「你错了」**。用户在这张表单上
 * 唯一想做的事就是拿到一张能扫的标签，报错必须直接告诉他怎么改。
 *
 * <p>EAN/UPC 的校验位只补不猜：填 12 位就补成 13 位；填满 13 位但校验位不对，
 * 直接报出正确值，**不会**偷偷替换掉他填的那一位 —— 那等于把一次输入错误伪装成成功。
 */
public final class BarcodeContent {

    /** Code 128 上限 48 字符：再长条宽会细到打不出来，属于产品边界而非技术限制 */
    private static final int CODE_128_MAX = 48;
    private static final int CODE_39_MAX = 43;
    private static final String CODE_39_CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%";

    private BarcodeContent() {
    }

    /**
     * @param text             送进编码器的最终内容（EAN/UPC 已补齐校验位）
     * @param checksumAppended 是否由系统补了校验位
     */
    public record Prepared(String text, boolean checksumAppended) {
    }

    public static Prepared prepare(BarcodeSymbology symbology, String raw) {
        String content = raw == null ? "" : raw.strip();
        if (content.isEmpty()) {
            throw new BarcodeException(400, "请填写" + symbology.label() + "的内容");
        }
        return switch (symbology) {
            case EAN_13 -> gs1(symbology, content, 12, 13, "690123456789");
            case EAN_8 -> gs1(symbology, content, 7, 8, "6901234");
            case UPC_A -> gs1(symbology, content, 11, 12, "01234567890");
            case CODE_128 -> code128(content);
            case CODE_39 -> code39(content);
        };
    }

    /**
     * GS1 系码制（EAN-13 / EAN-8 / UPC-A）。
     *
     * @param dataLen 不含校验位的位数
     * @param fullLen 含校验位的位数
     * @param sample  提示样例
     */
    private static Prepared gs1(BarcodeSymbology symbology, String raw, int dataLen, int fullLen, String sample) {
        // 用户从 Excel 复制过来常带空格或连字符，直接吃掉比报错友好
        String digits = raw.replaceAll("[\\s\\-]", "");
        if (!digits.matches("\\d+")) {
            throw new BarcodeException(400, symbology.label() + " 只能填数字，当前内容含非数字字符。"
                    + "示例：" + sample);
        }
        if (digits.length() == dataLen) {
            int check = ChecksumUtil.gs1CheckDigit(digits);
            return new Prepared(digits + check, true);
        }
        if (digits.length() == fullLen) {
            if (!ChecksumUtil.isValidGs1(digits)) {
                String correct = digits.substring(0, dataLen) + ChecksumUtil.gs1CheckDigit(digits.substring(0, dataLen));
                throw new BarcodeException(400, "校验位不正确：按前 " + dataLen + " 位计算，末位应为 "
                        + correct.charAt(fullLen - 1) + "，你填的是 " + digits.charAt(fullLen - 1)
                        + "。正确内容：" + correct + "（也可以只填前 " + dataLen + " 位，系统自动补校验位）");
            }
            return new Prepared(digits, false);
        }
        throw new BarcodeException(400, symbology.label() + " 需要 " + dataLen + " 位数字（校验位自动生成），"
                + "或 " + fullLen + " 位完整码；当前填了 " + digits.length() + " 位。示例：" + sample);
    }

    private static Prepared code128(String content) {
        if (content.length() > CODE_128_MAX) {
            throw new BarcodeException(400, "Code 128 最多 " + CODE_128_MAX + " 个字符（当前 " + content.length()
                    + "），太长会细到打不出来。建议改用二维码或缩短编号。");
        }
        for (int i = 0; i < content.length(); i++) {
            char c = content.charAt(i);
            if (c < 32 || c > 126) {
                throw new BarcodeException(400, "Code 128 只支持可打印 ASCII（英文、数字、常用符号），"
                        + "第 " + (i + 1) + " 个字符「" + describe(c) + "」不在此范围。中文请改用二维码。");
            }
        }
        return new Prepared(content, false);
    }

    private static Prepared code39(String content) {
        // 小写转大写：Code 39 本身没有小写，转掉比报错省事
        String upper = content.toUpperCase(java.util.Locale.ROOT);
        if (upper.length() > CODE_39_MAX) {
            throw new BarcodeException(400, "Code 39 最多 " + CODE_39_MAX + " 个字符（当前 " + upper.length() + "）");
        }
        for (int i = 0; i < upper.length(); i++) {
            char c = upper.charAt(i);
            if (CODE_39_CHARSET.indexOf(c) < 0) {
                throw new BarcodeException(400, "Code 39 只支持 0-9、A-Z 与 - . 空格 $ / + %，"
                        + "第 " + (i + 1) + " 个字符「" + describe(c) + "」不在其中。");
            }
        }
        return new Prepared(upper, false);
    }

    /** 把不可见字符写成可读形式，否则报错里会出现一个空白引号 */
    private static String describe(char c) {
        if (c < 32) {
            return "\\u" + String.format("%04X", (int) c);
        }
        return String.valueOf(c);
    }
}
