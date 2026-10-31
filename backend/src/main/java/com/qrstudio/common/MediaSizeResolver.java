package com.qrstudio.common;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.File;
import java.util.List;

/**
 * 统计媒体文件的真实体积，用于按体积阶梯计价。
 *
 * <p>客户端上报的 size 可以被篡改，而 {@code /uploads/<sha256>.<ext>} 是后端自己写出的文件，
 * 长度可信 —— 所以站内文件一律 stat 磁盘，只有外链才退回客户端上报值。
 */
@Slf4j
@Component
public class MediaSizeResolver {

    private static final long MAX_SINGLE_BYTES = 500L * 1024 * 1024;

    @Value("${app.upload.dir:data/uploads}")
    private String uploadDirPath;

    /**
     * 逐个文件统计体积（按件计价用）。
     *
     * <p>返回顺序与入参一致，且<b>长度恒定等于「有效 url 的条目数」</b>——
     * 大小测不出来的按 0 计入，绝不跳过。这一点很关键：
     * 按件计价的金额是 {@code Σ 单件价(bytes)}，如果这里少返回一项，
     * 就会变成「托管了 3 个文件、只收 2 份钱」，而且订单校验还会通过
     * （已付 ≥ 应付），属于静默少收，账面上看不出来。
     *
     * <p>只有连 url 都没有的脏条目才丢弃 —— 那种条目在落地页上也渲染不出来。
     */
    public List<Long> sizes(List<MediaRef> mediaList) {
        if (mediaList == null || mediaList.isEmpty()) {
            return List.of();
        }

        File uploadDir = new File(uploadDirPath);
        List<Long> result = new java.util.ArrayList<>(mediaList.size());

        for (MediaRef media : mediaList) {
            if (media == null || media.getUrl() == null || media.getUrl().trim().isEmpty()) continue;
            String url = media.getUrl().trim();

            if (url.startsWith("/uploads/")) {
                String name = url.substring("/uploads/".length());
                // 只接受一级文件名，挡住 ../ 之类的路径穿越
                if (name.isEmpty() || name.contains("/") || name.contains("\\") || name.contains("..")) {
                    // 非法路径不可能真有文件，但条目本身占一个位，按 0 字节计入
                    result.add(0L);
                    continue;
                }
                File file = new File(uploadDir, name);
                if (file.isFile()) {
                    result.add(Math.min(file.length(), MAX_SINGLE_BYTES));
                    continue;
                }
                log.debug("媒体文件在磁盘上不存在，按 0 字节计入: {}", url);
            }

            if (media.getSize() != null && media.getSize() > 0) {
                result.add(Math.min(media.getSize(), MAX_SINGLE_BYTES));
            } else {
                // 外链没带上报体积：件数照算，体积按 0（即不收超量费，宁可少收不误判超额）
                result.add(0L);
            }
        }

        return result;
    }
}
