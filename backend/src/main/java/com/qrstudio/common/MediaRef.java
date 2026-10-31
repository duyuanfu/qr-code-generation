package com.qrstudio.common;

import lombok.Data;

/** 媒体引用：URL + 客户端上报体积（体积仅作外链兜底，/uploads/ 下的文件以磁盘真实大小为准） */
@Data
public class MediaRef {
    private String url;
    private Long size;
}
