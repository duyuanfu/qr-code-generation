package com.qrstudio.controller;

import com.qrstudio.common.Result;
import com.qrstudio.common.UserContext;
import com.qrstudio.gif.GifException;
import com.qrstudio.gif.GifExportService;
import com.qrstudio.gif.GifOptions;
import com.qrstudio.gif.QrCleaner;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 二维码动图（GIF）导出。
 *
 * <p>三个接口的分工：
 * <ul>
 *   <li>{@code /precheck} —— 免费、可匿名，只渲染末帧判断「能不能扫」，通过后才值得付钱；</li>
 *   <li>{@code /clean-qr} —— 需登录（会落一份新图），把带了产品图案的二维码重绘成干净的标准码；</li>
 *   <li>{@code /generate} —— 需登录 + 已支付订单，出成品并核销。</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/gif")
@RequiredArgsConstructor
public class GifExportController {

    private final GifExportService gifExportService;
    private final QrCleaner qrCleaner;

    @PostMapping("/precheck")
    public Result<?> precheck(@RequestBody GifOptions options) {
        try {
            return Result.ok(gifExportService.precheck(options));
        } catch (GifException e) {
            return failure(e);
        }
    }

    /**
     * 去掉二维码中间的产品图案：解码 → 按同一内容重绘一张标准二维码。
     *
     * <p>为什么不做「涂白」：图案盖住的位置本来就是数据模块，涂白只是把干扰换成了
     * 错误模块，能不能扫全看容错率，还会留一块白斑。重绘则是真正把码还原干净，
     * 代价是不保留原图的配色与圆点样式（见 {@link QrCleaner}）。
     */
    @PostMapping("/clean-qr")
    public Result<?> cleanQr(@RequestBody Map<String, String> body) {
        if (UserContext.get() == null) {
            return Result.error(401, "去除图案前请先登录");
        }
        try {
            return Result.ok("已重绘为干净二维码", qrCleaner.clean(body.get("url")));
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
