package com.qrstudio.gif;

/** GIF 导出链路里的业务异常，直接映射成 HTTP 语义化的错误码 */
public class GifException extends RuntimeException {

    private final int code;
    private final transient Object data;

    public GifException(int code, String message) {
        this(code, message, null);
    }

    public GifException(int code, String message, Object data) {
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
