package com.qrstudio.barcode;

import com.qrstudio.common.UserContext;
import com.qrstudio.entity.Order;
import com.qrstudio.mapper.OrderMapper;
import com.qrstudio.service.PricingService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * 订单语义：幂等、拒付、核销时机。
 *
 * <p>这三条直接对应钱：重复提交不能二次扣费；没过自检不能核销；
 * 计费项对不上不能放行。
 */
class BarcodeExportServiceTest {

    private static final UserContext.CurrentUser USER = UserContext.CurrentUser.builder()
            .userId("u1").email("u@example.com").role("user").build();

    private final OrderMapper orderMapper = mock(OrderMapper.class);
    private final PricingService pricingService = mock(PricingService.class);

    private BarcodeExportService service(Path uploadDir) {
        BarcodeExportService s = new BarcodeExportService(orderMapper, pricingService);
        ReflectionTestUtils.setField(s, "uploadDirPath", uploadDir.toString());
        return s;
    }

    private static Order order(String id, String status, String resultUrl) {
        Order o = new Order();
        o.setId(id);
        o.setUserId("u1");
        o.setStatus(status);
        o.setActionType(PricingService.ACTION_BARCODE);
        o.setResultUrl(resultUrl);
        return o;
    }

    private static BarcodeOptions options(String orderId) {
        BarcodeOptions o = new BarcodeOptions();
        o.setSymbology("EAN_13");
        o.setContent("690123456789");
        o.setLabelWidthMm(40.0);
        o.setLabelHeightMm(25.0);
        o.setDpi(300);
        o.setOrderId(orderId);
        return o;
    }

    @Test
    void paywallWithoutOrderIsRejectedBeforeAnyRendering() {
        when(pricingService.isPaywallActive(PricingService.ACTION_BARCODE, null)).thenReturn(true);

        BarcodeException e = assertThrows(BarcodeException.class,
                () -> service(Path.of("target")).export(options(null), USER));
        assertEquals(402, e.getCode());
        verify(orderMapper, never()).updateById(any());
    }

    @Test
    void orderForAnotherFeatureIsRejected() {
        when(pricingService.isPaywallActive(PricingService.ACTION_BARCODE, null)).thenReturn(true);
        Order o = order("o1", "paid", null);
        o.setActionType(PricingService.ACTION_GIF);
        when(orderMapper.selectById("o1")).thenReturn(o);

        BarcodeException e = assertThrows(BarcodeException.class,
                () -> service(Path.of("target")).export(options("o1"), USER));
        assertEquals(402, e.getCode());
    }

    @Test
    void secondRequestWithTheSameOrderReturnsTheStoredFiles(@TempDir Path dir) {
        when(pricingService.isPaywallActive(PricingService.ACTION_BARCODE, null)).thenReturn(true);
        when(orderMapper.selectById("o1")).thenReturn(order("o1", "used", "/uploads/barcode/o1.png"));

        var out = service(dir).export(options("o1"), USER);

        assertEquals("/uploads/barcode/o1.png", out.get("pngUrl"));
        assertEquals("/uploads/barcode/o1.svg", out.get("svgUrl"));
        assertEquals(Boolean.TRUE, out.get("cached"));
        verify(orderMapper, never()).updateById(any());
        assertTrue(Files.notExists(dir.resolve("barcode").resolve("o1.png")), "幂等分支不应重新出图");
    }

    @Test
    void successfulExportWritesBothFilesAndConsumesTheOrder(@TempDir Path dir) {
        when(pricingService.isPaywallActive(PricingService.ACTION_BARCODE, null)).thenReturn(true);
        Order paid = order("o1", "paid", null);
        when(orderMapper.selectById("o1")).thenReturn(paid);

        var out = service(dir).export(options("o1"), USER);

        assertTrue(Files.isRegularFile(dir.resolve("barcode").resolve("o1.png")));
        assertTrue(Files.isRegularFile(dir.resolve("barcode").resolve("o1.svg")));
        assertEquals("/uploads/barcode/o1.png", out.get("pngUrl"));
        assertEquals("used", paid.getStatus());
        assertEquals("/uploads/barcode/o1.png", paid.getResultUrl());
        verify(orderMapper).updateById(paid);

        @SuppressWarnings("unchecked")
        var verifyMap = (java.util.Map<String, Boolean>) out.get("verify");
        assertEquals(Boolean.TRUE, verifyMap.get("native"));
        assertEquals(Boolean.TRUE, verifyMap.get("degraded"));
    }

    @Test
    void previewReturnsADataUrlAndNeverTouchesDisk(@TempDir Path dir) {
        var out = service(dir).preview(options(null));

        String dataUrl = (String) out.get("dataUrl");
        assertTrue(dataUrl.startsWith("data:image/png;base64,"));
        @SuppressWarnings("unchecked")
        var metrics = (java.util.Map<String, Object>) out.get("metrics");
        assertEquals("6901234567892", metrics.get("normalizedContent"));
        assertTrue(Files.notExists(dir.resolve("barcode")));
    }
}
