package com.qrstudio.controller;

import com.qrstudio.common.Result;
import com.qrstudio.common.UserContext;
import com.qrstudio.gif.GifException;
import com.qrstudio.gif.GifExportService;
import com.qrstudio.gif.GifOptions;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 二维码动图（GIF）导出。
 *
 * <p>两个接口的分工：
 * <ul>
 *   <li>{@code /precheck} —— 免费、可匿名，只渲染末帧判断「能不能扫」，通过后才值得付钱；</li>
 *   <li>{@code /generate} —— 需登录 + 已支付订单，出成品并核销。</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/gif")
@RequiredArgsConstructor
public class GifExportController {

    private final GifExportService gifExportService;

    @PostMapping("/precheck")
    public Result<?> precheck(@RequestBody GifOptions options) {
        try {
            return Result.ok(gifExportService.precheck(options));
        } catch (GifException e) {
            return failure(e);
        }
    }

    @PostMapping("/generate")
    public Result<?> generate(@RequestBody GifOptions options) {
        UserContext.CurrentUser user = UserContext.get();
        if (user == null) {
            return Result.error(401, "生成 GIF 前请先登录");
        }
        try {
            return Result.ok("生成成功", gifExportService.generate(options, user));
        } catch (GifException e) {
            return failure(e);
        }
    }

    /** 把业务异常翻译成带 code 与附加数据的失败响应（422 会带上建议参数） */
    private Result<?> failure(GifException e) {
        return Result.builder()
                .success(false)
                .code(e.getCode())
                .message(e.getMessage())
                .data(e.getData())
                .build();
    }
}
