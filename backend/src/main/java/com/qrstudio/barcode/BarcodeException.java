package com.qrstudio.barcode;

/**
 * 条形码链路的业务异常，直接映射成 HTTP 语义化的错误码。
 *
 * <p>与 {@code GifException} 分开：两个包各自演进，共用一个异常会让错误来源变模糊。
 */
public class BarcodeException extends RuntimeException {

    private final int code;
    private final transient Object data;

    public BarcodeException(int code, String message) {
        this(code, message, null);
    }

    public BarcodeException(int code, String message, Object data) {
        super(message);
        this.code = code;
        this.data = data;
    }

    public int getCode() {
        return code;
    }

    public Object getData() {
        return data;
    }
}
