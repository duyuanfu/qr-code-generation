package com.qrstudio.controller;

import com.qrstudio.common.FileValidator;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.*;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.*;

@RestController
@RequestMapping("/api/upload")
@RequiredArgsConstructor
public class UploadController {

    private static final int BUFFER_SIZE = 64 * 1024;

    private final FileValidator fileValidator;

    @Value("${app.upload.dir:data/uploads}")
    private String uploadDirPath;

    @Value("${app.upload.max-file-size-mb:500}")
    private long maxFileSizeMb;

    @PostMapping
    public Map<String, Object> uploadFiles(
            @RequestParam(value = "files", required = false) List<MultipartFile> files) {
        Map<String, Object> response = new HashMap<>();

        if (files == null || files.isEmpty()) {
            return error(response, "未选择上传文件");
        }

        File uploadDir = new File(uploadDirPath);
        if (!uploadDir.exists() && !uploadDir.mkdirs()) {
            return error(response, "服务端存储目录不可用，请联系管理员");
        }

        long maxBytes = maxFileSizeMb * 1024 * 1024;
        List<Map<String, Object>> resultFiles = new ArrayList<>();

        for (MultipartFile file : files) {
            String originalFilename = file.getOriginalFilename();
            if (originalFilename == null || originalFilename.trim().isEmpty()) {
                originalFilename = "unnamed.bin";
            }

            // 1. 元信息校验（大小 / 扩展名 / 敏感词），不读内容，几百 MB 也是零开销
            FileValidator.ValidationResult meta =
                    fileValidator.validateMeta(originalFilename, file.getSize(), maxBytes);
            if (!meta.isValid()) {
                return error(response, meta.getMessage());
            }

            File tempFile = null;
            try {
                tempFile = File.createTempFile("up-", ".part", uploadDir);

                // 2. 读文件头做魔数嗅探，确认内容与扩展名一致
                String hash;
                try (InputStream in = file.getInputStream()) {
                    byte[] header = in.readNBytes(FileValidator.HEADER_SNIFF_BYTES);
                    FileValidator.ValidationResult headerCheck =
                            fileValidator.validateHeader(originalFilename, header);
                    if (!headerCheck.isValid()) {
                        return error(response, headerCheck.getMessage());
                    }
                    // 3. 流式落盘 + 增量 SHA-256，避免把整个视频读进堆内存
                    hash = streamToTemp(in, header, tempFile, maxBytes);
                }

                int dotIdx = originalFilename.lastIndexOf('.');
                String ext = dotIdx >= 0 ? originalFilename.substring(dotIdx).toLowerCase() : ".bin";
                File targetFile = new File(uploadDir, hash + ext);

                // 4. 相同内容秒传复用，只有真正的新文件才落最终路径
                if (targetFile.exists()) {
                    Files.deleteIfExists(tempFile.toPath());
                } else {
                    Files.move(tempFile.toPath(), targetFile.toPath(), StandardCopyOption.REPLACE_EXISTING);
                }
                tempFile = null;

                Map<String, Object> item = new LinkedHashMap<>();
                item.put("id", UUID.randomUUID().toString().substring(0, 10));
                item.put("name", originalFilename);
                item.put("url", "/uploads/" + hash + ext);
                item.put("size", file.getSize());
                item.put("type", file.getContentType());
                resultFiles.add(item);

            } catch (UploadTooLargeException e) {
                return error(response, e.getMessage());
            } catch (IOException e) {
                return error(response, "文件写入失败: " + e.getMessage());
            } finally {
                if (tempFile != null) {
                    // 校验不通过 / 写入异常时不留半截残片
                    //noinspection ResultOfMethodCallIgnored
                    tempFile.delete();
                }
            }
        }

        response.put("success", true);
        response.put("files", resultFiles);
        return response;
    }

    /**
     * 把输入流写入临时文件，同时增量计算 SHA-256。
     * 内存占用恒定为 BUFFER_SIZE，与文件大小无关。
     */
    private String streamToTemp(InputStream in, byte[] header, File tempFile, long maxBytes)
            throws IOException {
        MessageDigest digest;
        try {
            digest = MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException e) {
            throw new IOException("SHA-256 不可用", e);
        }

        long total = header.length;
        digest.update(header);

        try (OutputStream out = new BufferedOutputStream(new FileOutputStream(tempFile), BUFFER_SIZE)) {
            out.write(header);
            byte[] buf = new byte[BUFFER_SIZE];
            int read;
            while ((read = in.read(buf)) != -1) {
                total += read;
                // 双层保险：不信任 Content-Length，按实际字节数再卡一次上限
                if (total > maxBytes) {
                    throw new UploadTooLargeException("文件大小超出系统限制（单个文件最大 "
                            + (maxBytes / (1024 * 1024)) + "MB），请压缩或裁剪后重试");
                }
                digest.update(buf, 0, read);
                out.write(buf, 0, read);
            }
        }
        return toHex(digest.digest());
    }

    private static String toHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            sb.append(Character.forDigit((b >> 4) & 0xF, 16));
            sb.append(Character.forDigit(b & 0xF, 16));
        }
        return sb.toString();
    }

    private static Map<String, Object> error(Map<String, Object> response, String message) {
        response.put("success", false);
        response.put("error", message);
        return response;
    }

    static class UploadTooLargeException extends IOException {
        UploadTooLargeException(String message) {
            super(message);
        }
    }
}
