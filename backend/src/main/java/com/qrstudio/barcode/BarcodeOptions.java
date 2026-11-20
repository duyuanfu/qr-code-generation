package com.qrstudio.barcode;

/**
 * 条形码导出请求体。
 *
 * <p>**手写 getter/setter**：运行时不做注解处理，Lombok 在 IDE 里能编译，
 * 但反射式的 JSON 反序列化依赖 setter 存在，为什么不赌这一点，与 {@code GifOptions} 保持一致。
 */
public class BarcodeOptions {

    private String symbology = "EAN_13";
    private String content = "";
    private Double labelWidthMm = 40.0;
    private Double labelHeightMm = 25.0;
    private Integer dpi = 300;
    private Boolean showText = Boolean.TRUE;
    private String caption = "";
    /** 导出时必填（付费链路）；预览忽略 */
    private String orderId;

    public String getSymbology() {
        return symbology;
    }

    public void setSymbology(String symbology) {
        this.symbology = symbology;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }

    public Double getLabelWidthMm() {
        return labelWidthMm;
    }

    public void setLabelWidthMm(Double labelWidthMm) {
        this.labelWidthMm = labelWidthMm;
    }

    public Double getLabelHeightMm() {
        return labelHeightMm;
    }

    public void setLabelHeightMm(Double labelHeightMm) {
        this.labelHeightMm = labelHeightMm;
    }

    public Integer getDpi() {
        return dpi;
    }

    public void setDpi(Integer dpi) {
        this.dpi = dpi;
    }

    public Boolean getShowText() {
        return showText;
    }

    public void setShowText(Boolean showText) {
        this.showText = showText;
    }

    public String getCaption() {
        return caption;
    }

    public void setCaption(String caption) {
        this.caption = caption;
    }

    public String getOrderId() {
        return orderId;
    }

    public void setOrderId(String orderId) {
        this.orderId = orderId;
    }

    /**
     * 校验并规整。
     *
     * <p>数值越界一律**拒绝**而不是静默夹取：用户填 12mm 标签，说明他以为能印 12mm，
     * 悄悄改成 15mm 会打出贴不上的东西。只有 caption 长度这种无害的字段才静默截断。
     */
    public BarcodeSpec normalize() {
        BarcodeSymbology type = BarcodeSymbology.parse(symbology);

        double w = labelWidthMm == null ? 40 : labelWidthMm;
        double h = labelHeightMm == null ? 25 : labelHeightMm;
        int d = dpi == null ? 300 : dpi;

        if (w < 15 || w > 200) {
            throw new BarcodeException(400, "标签宽度需在 15~200mm 之间（当前 " + trim(w) + "mm）");
        }
        if (h < 10 || h > 150) {
            throw new BarcodeException(400, "标签高度需在 10~150mm 之间（当前 " + trim(h) + "mm）");
        }
        if (d != 203 && d != 300 && d != 600) {
            throw new BarcodeException(400, "DPI 只支持 203（热敏）/ 300（激光、喷墨）/ 600");
        }
        if ((long) Math.round(w / 25.4 * d) * Math.round(h / 25.4 * d) > 40_000_000L) {
            throw new BarcodeException(400, "标签尺寸过大（超过 4000 万像素），请降低 DPI 或缩小尺寸");
        }

        String cap = caption == null ? "" : caption.strip().replaceAll("\\s+", " ");
        if (cap.codePointCount(0, cap.length()) > 40) {
            int cut = cap.offsetByCodePoints(0, 40);
            cap = cap.substring(0, cut);
        }

        return new BarcodeSpec(type, content == null ? "" : content, w, h, d,
                showText == null || showText, cap);
    }

    private static String trim(double v) {
        return v == Math.rint(v) ? String.valueOf((long) v) : String.format("%.1f", v);
    }
}
