package com.qrstudio.controller;

import com.qrstudio.barcode.BarcodeException;
import com.qrstudio.barcode.BarcodeExportService;
import com.qrstudio.barcode.BarcodeOptions;
import com.qrstudio.common.Result;
import com.qrstudio.common.UserContext;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 商品条形码标签导出。
 *
 * <p>两个接口的分工与 GIF 一致：
 * <ul>
 *   <li>{@code /preview} —— 免费、可匿名，每模块 1 像素（印不出来，但结构完全真实）；</li>
 *   <li>{@code /export} —— 需登录 + 已支付订单，出 PNG + SVG 并核销。</li>
 * </ul>
 *
 * <p>为什么这条链路不走前端：{@code @zxing/library} 只带二维码 writer，没有一维码 writer；
 * 而且物理尺寸必须落在整数模块像素上，浏览器 canvas 缩放会引入半像素，条宽比例立刻失真。
 */
@RestController
@RequestMapping("/api/barcode")
@RequiredArgsConstructor
public class BarcodeController {

    private final BarcodeExportService barcodeExportService;

    @PostMapping("/preview")
    public Result<?> preview(@RequestBody BarcodeOptions options) {
        try {
            return Result.ok(barcodeExportService.preview(options));
        } catch (BarcodeException e) {
            return failure(e);
        }
    }

    @PostMapping("/export")
    public Result<?> export(@RequestBody BarcodeOptions options) {
        UserContext.CurrentUser user = UserContext.get();
        if (user == null) {
            return Result.error(401, "导出条形码前请先登录");
        }
        try {
            return Result.ok("导出成功", barcodeExportService.export(options, user));
        } catch (BarcodeException e) {
            return failure(e);
        }
    }

    /** 把业务异常翻译成带 code 与附加数据的失败响应（422 会带上校验结论与尺寸） */
    private Result<?> failure(BarcodeException e) {
        return Result.builder()
                .success(false)
                .code(e.getCode())
                .message(e.getMessage())
                .data(e.getData())
                .build();
    }
}
