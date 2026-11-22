package com.qrstudio.gif;

import java.nio.file.Files;
import java.nio.file.Path;

/**
 * 把 {@code /uploads/xxx} 这类前端传入的地址解析成磁盘路径。
 *
 * <p>只接受一级文件名：这个参数来自请求体，不校验的话用户可以读到服务器上任意可读文件。
 * GIF 导出与二维码重绘都要用，抽出来避免两份实现慢慢跑偏。
 */
final class UploadPath {

    private UploadPath() {
    }

    /**
     * @param uploadDir 上传根目录（{@code app.upload.dir}）
     * @param url       前端传来的地址，形如 {@code /uploads/ab12.jpg}
     * @param label     出错时回显给用户的对象名，如「底图」
     */
    static Path resolve(String uploadDir, String url, String label) {
        if (url == null || url.isBlank()) {
            throw new GifException(400, "请上传" + label);
        }
        String name;
        if (url.startsWith("/uploads/")) {
            name = url.substring("/uploads/".length());
        } else if (!url.startsWith("http")) {
            name = url;
        } else {
            throw new GifException(400, label + "需先上传到本站，不支持外链");
        }
        if (name.isEmpty() || name.contains("/") || name.contains("\\") || name.contains("..")) {
            throw new GifException(400, label + "路径非法");
        }
        Path path = Path.of(uploadDir, name);
        if (!Files.isRegularFile(path)) {
            throw new GifException(400, label + "文件不存在，请重新上传");
        }
        return path;
    }
}
