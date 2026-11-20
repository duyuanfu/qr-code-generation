package com.qrstudio.barcode;

/**
 * 校验并规整后的请求参数。
 *
 * <p>与 {@link BarcodeOptions} 分开的原因：DTO 是「用户可能填错的一堆值」，
 * 这个 record 是「已经确认合法、后面每一步都可以直接信任的值」。
 * 编码、算尺寸、出图三处都只接受它，避免把校验散落在各个角落。
 */
public record BarcodeSpec(
        BarcodeSymbology symbology,
        String content,
        double labelWidthMm,
        double labelHeightMm,
        int dpi,
        boolean showText,
        String caption) {
}
