package com.qrstudio.common;

import org.springframework.stereotype.Component;

import java.util.*;

/**
 * 上传文件的安全与合规校验。
 *
 * <p>校验被拆成两段，是因为大文件（动辄几百 MB 的视频）不能被整体读进内存：
 * <ol>
 *   <li>{@link #validateMeta(String, long, long)} —— 只看文件名、大小，落盘前就能拦掉大部分非法请求；</li>
 *   <li>{@link #validateHeader(String, byte[])} —— 只读文件头若干字节做魔数嗅探，防止改扩展名伪装。</li>
 * </ol>
 * {@link #validate(String, byte[], long)} 是小文件场景的便捷组合（同时保留给单元测试使用）。
 */
@Component
public class FileValidator {

    /** 魔数嗅探需要读取的文件头长度；mp4 的 ftyp box 落在前 32 字节内，64 字节足够所有格式判断 */
    public static final int HEADER_SNIFF_BYTES = 64;

    // 允许上传的扩展名：覆盖日常办公 / 音视频 / 图片 / 压缩包
    private static final Set<String> ALLOWED_EXTENSIONS = new HashSet<>(Arrays.asList(
            // 图片
            ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".avif",
            // 视频
            ".mp4", ".m4v", ".mov", ".webm", ".mkv", ".avi", ".mpg", ".mpeg",
            // 音频
            ".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg",
            // 办公文档
            ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
            ".odt", ".ods", ".odp", ".rtf", ".txt", ".md", ".csv",
            // 压缩包
            ".zip", ".rar", ".7z", ".tar", ".gz"
    ));

    // 明确禁止的可执行 / 脚本扩展名（在黑名单里给出更明确的提示文案）
    private static final Set<String> DANGEROUS_EXTENSIONS = new HashSet<>(Arrays.asList(
            ".exe", ".bat", ".cmd", ".sh", ".bash", ".bin",
            ".php", ".jsp", ".asp", ".aspx", ".py", ".rb",
            ".js", ".vbs", ".ps1", ".html", ".htm", ".svg",
            ".jar", ".war", ".dll", ".scr", ".msi"
    ));

    // 敏感 / 违规关键词
    private static final List<String> SENSITIVE_KEYWORDS = Arrays.asList(
            "赌博", "色情", "黄色网站", "枪支", "弹药", "办证", "发票", "洗钱",
            "代考", "病毒", "外挂", "裸聊", "私彩", "百家乐", "成人视频"
    );

    public static class ValidationResult {
        private final boolean valid;
        private final String message;

        public ValidationResult(boolean valid, String message) {
            this.valid = valid;
            this.message = message;
        }

        public boolean isValid() {
            return valid;
        }

        public String getMessage() {
            return message;
        }
    }

    private static ValidationResult pass() {
        return new ValidationResult(true, "校验通过");
    }

    private static ValidationResult fail(String message) {
        return new ValidationResult(false, message);
    }

    /** 提取小写扩展名；没有扩展名时返回空串 */
    public String extensionOf(String originalFilename) {
        if (originalFilename == null) return "";
        int dotIndex = originalFilename.lastIndexOf('.');
        return dotIndex >= 0 ? originalFilename.substring(dotIndex).toLowerCase() : "";
    }

    /**
     * 元信息校验：文件大小、扩展名白名单、危险后缀、文件名敏感词。
     * 不读取文件内容，因此对任意大小的文件都是常量开销。
     */
    public ValidationResult validateMeta(String originalFilename, long sizeBytes, long maxSizeBytes) {
        if (originalFilename == null || originalFilename.trim().isEmpty()) {
            return fail("无效的文件名称");
        }
        if (sizeBytes <= 0) {
            return fail("上传文件为空");
        }
        if (sizeBytes > maxSizeBytes) {
            return fail("文件大小 " + humanSize(sizeBytes) + " 超出系统限制（单个文件最大 "
                    + (maxSizeBytes / (1024 * 1024)) + "MB）");
        }

        String lowerName = originalFilename.toLowerCase();
        String ext = extensionOf(lowerName);
        if (ext.isEmpty()) {
            return fail("文件缺少有效扩展名");
        }

        if (DANGEROUS_EXTENSIONS.contains(ext)) {
            return fail("系统安全防御：禁止上传可执行文件或包含脚本的代码文件 (" + ext + ")");
        }

        if (!ALLOWED_EXTENSIONS.contains(ext)) {
            return fail("不支持的文件格式 (" + ext + ")，仅支持常用音视频、图片及办公文档");
        }

        for (String word : SENSITIVE_KEYWORDS) {
            if (originalFilename.contains(word)) {
                return fail("文件名包含敏感合规违规词汇，系统已拦截");
            }
        }

        return pass();
    }

    /**
     * 文件头魔数校验，只需传入文件开头的 {@link #HEADER_SNIFF_BYTES} 个字节。
     */
    public ValidationResult validateHeader(String originalFilename, byte[] headerBytes) {
        String ext = extensionOf(originalFilename);
        if (ext.isEmpty()) {
            return fail("文件缺少有效扩展名");
        }
        if (headerBytes == null || headerBytes.length < 4) {
            return fail("上传文件为空");
        }
        if (!checkMagicNumber(ext, headerBytes)) {
            return fail("文件内容与扩展名不匹配（检测到文件头伪装），系统拒绝上传");
        }
        return pass();
    }

    /** 小文件便捷组合校验（内容全量在内存中时使用） */
    public ValidationResult validate(String originalFilename, byte[] fileBytes, long maxSizeBytes) {
        if (fileBytes == null || fileBytes.length == 0) {
            return fail("上传文件为空");
        }
        ValidationResult meta = validateMeta(originalFilename, fileBytes.length, maxSizeBytes);
        if (!meta.isValid()) {
            return meta;
        }
        return validateHeader(originalFilename, fileBytes);
    }

    public boolean checkTextCompliance(String text) {
        if (text == null || text.trim().isEmpty()) {
            return true;
        }
        for (String word : SENSITIVE_KEYWORDS) {
            if (text.contains(word)) {
                return false;
            }
        }
        return true;
    }

    public static String humanSize(long bytes) {
        if (bytes >= 1024L * 1024 * 1024) {
            return String.format("%.1fGB", bytes / (1024.0 * 1024 * 1024));
        }
        if (bytes >= 1024L * 1024) {
            return String.format("%.1fMB", bytes / (1024.0 * 1024));
        }
        if (bytes >= 1024L) {
            return String.format("%.1fKB", bytes / 1024.0);
        }
        return bytes + "B";
    }

    private boolean checkMagicNumber(String ext, byte[] bytes) {
        if (bytes.length < 4) return false;

        switch (ext) {
            case ".pdf":
                // %PDF- (0x25 0x50 0x44 0x46)
                return bytes[0] == 0x25 && bytes[1] == 0x50 && bytes[2] == 0x44 && bytes[3] == 0x46;

            case ".png":
                // 0x89 0x50 0x4E 0x47
                return (bytes[0] & 0xFF) == 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4E && bytes[3] == 0x47;

            case ".jpg":
            case ".jpeg":
                // 0xFF 0xD8 0xFF
                return (bytes[0] & 0xFF) == 0xFF && (bytes[1] & 0xFF) == 0xD8 && (bytes[2] & 0xFF) == 0xFF;

            case ".gif":
                // GIF8
                return bytes[0] == 'G' && bytes[1] == 'I' && bytes[2] == 'F' && bytes[3] == '8';

            case ".webp":
                // RIFF ... WEBP
                if (bytes.length < 12) return false;
                return bytes[0] == 'R' && bytes[1] == 'I' && bytes[2] == 'F' && bytes[3] == 'F'
                        && bytes[8] == 'W' && bytes[9] == 'E' && bytes[10] == 'B' && bytes[11] == 'P';

            case ".mp4":
            case ".m4v":
            case ".mov":
            case ".m4a":
            case ".avif":
                // ISO BMFF 家族（mp4/m4v/mov/m4a/avif）都以 ftyp box 标识，通常在第 4-8 字节
                return hasFtypBox(bytes);

            case ".webm":
            case ".mkv":
                // EBML 头 0x1A 0x45 0xDF 0xA3（webm 与 mkv 同容器，只是 codec 白名单不同）
                return (bytes[0] & 0xFF) == 0x1A && (bytes[1] & 0xFF) == 0x45
                        && (bytes[2] & 0xFF) == 0xDF && (bytes[3] & 0xFF) == 0xA3;

            case ".avi":
                // RIFF ... AVI␠
                if (bytes.length < 12) return false;
                return bytes[0] == 'R' && bytes[1] == 'I' && bytes[2] == 'F' && bytes[3] == 'F'
                        && bytes[8] == 'A' && bytes[9] == 'V' && bytes[10] == 'I' && bytes[11] == ' ';

            case ".mpg":
            case ".mpeg":
                // MPEG-PS/ES 起始码 00 00 01 BA / B3
                return bytes[0] == 0 && bytes[1] == 0 && bytes[2] == 1
                        && ((bytes[3] & 0xFF) == 0xBA || (bytes[3] & 0xFF) == 0xB3);

            case ".mp3":
                // ID3 标签，或无标签时的帧同步 0xFF Ex
                if (bytes[0] == 'I' && bytes[1] == 'D' && bytes[2] == '3') return true;
                return (bytes[0] & 0xFF) == 0xFF && (bytes[1] & 0xE0) == 0xE0;

            case ".aac":
                // ADTS 帧头 0xFF F1 / F9
                return (bytes[0] & 0xFF) == 0xFF && (bytes[1] & 0xF6) == 0xF0;

            case ".wav":
                // RIFF ... WAVE
                if (bytes.length < 12) return false;
                return bytes[0] == 'R' && bytes[1] == 'I' && bytes[2] == 'F' && bytes[3] == 'F'
                        && bytes[8] == 'W' && bytes[9] == 'A' && bytes[10] == 'V' && bytes[11] == 'E';

            case ".flac":
                // fLaC
                return bytes[0] == 'f' && bytes[1] == 'L' && bytes[2] == 'a' && bytes[3] == 'C';

            case ".ogg":
                // OggS
                return bytes[0] == 'O' && bytes[1] == 'g' && bytes[2] == 'g' && bytes[3] == 'S';

            case ".bmp":
                // BM
                return bytes[0] == 'B' && bytes[1] == 'M';

            case ".docx":
            case ".xlsx":
            case ".pptx":
            case ".odt":
            case ".ods":
            case ".odp":
            case ".zip":
                // PK.. (0x50 0x4B 0x03 0x04)；空压缩包是 PK\x05\x06
                return bytes[0] == 0x50 && bytes[1] == 0x4B
                        && ((bytes[2] == 0x03 && bytes[3] == 0x04)
                        || (bytes[2] == 0x05 && bytes[3] == 0x06));

            case ".doc":
            case ".xls":
            case ".ppt":
                // 老版 Office 是 OLE2 复合文档：D0 CF 11 E0 A1 B1 1A E1
                return (bytes[0] & 0xFF) == 0xD0 && (bytes[1] & 0xFF) == 0xCF
                        && (bytes[2] & 0xFF) == 0x11 && (bytes[3] & 0xFF) == 0xE0;

            case ".rtf":
                // {\rtf
                return bytes[0] == '{' && bytes[1] == '\\' && bytes[2] == 'r' && bytes[3] == 't';

            case ".gz":
                // Gzip 1F 8B
                return (bytes[0] & 0xFF) == 0x1F && (bytes[1] & 0xFF) == 0x8B;

            case ".tar":
                // ustar 标记位于第 257 字节，超出 64 字节嗅探窗口，只能按扩展名放行
                return true;

            case ".rar":
                // Rar! \x1A\x07
                return bytes[0] == 'R' && bytes[1] == 'a' && bytes[2] == 'r' && bytes[3] == '!';

            case ".7z":
                // 7z\xBC\xAF\x27\x1C
                return (bytes[0] & 0xFF) == 0x37 && (bytes[1] & 0xFF) == 0x7A
                        && (bytes[2] & 0xFF) == 0xBC && (bytes[3] & 0xFF) == 0xAF;

            case ".txt":
            case ".csv":
            case ".md":
                // 纯文本没有魔数，退化为「前若干字节不含 NUL」的启发式判断
                int scan = Math.min(bytes.length, HEADER_SNIFF_BYTES);
                for (int i = 0; i < scan; i++) {
                    if (bytes[i] == 0) return false;
                }
                return true;

            default:
                return true;
        }
    }

    /** 在文件头 64 字节内查找 ftyp box（部分 mov 文件会把 ftyp 放在 moov 之后） */
    private boolean hasFtypBox(byte[] bytes) {
        int limit = Math.min(bytes.length - 4, HEADER_SNIFF_BYTES);
        for (int i = 4; i <= limit; i++) {
            if (bytes[i] == 'f' && bytes[i + 1] == 't' && bytes[i + 2] == 'y' && bytes[i + 3] == 'p') {
                return true;
            }
        }
        return false;
    }
}
