package com.qrstudio.barcode;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 内容校验的每条分支都要有断言：这里的报错文案是用户唯一能看到的「怎么改」，
 * 说错了比不报错更糟。
 */
class BarcodeContentTest {

    @Test
    void ean13AppendsCheckDigit() {
        var p = BarcodeContent.prepare(BarcodeSymbology.EAN_13, "690123456789");
        assertEquals("6901234567892", p.text());
        assertTrue(p.checksumAppended());
    }

    @Test
    void ean13AcceptsFullCodeWithoutAppending() {
        var p = BarcodeContent.prepare(BarcodeSymbology.EAN_13, "6901234567892");
        assertEquals("6901234567892", p.text());
        assertFalse(p.checksumAppended());
    }

    @Test
    void ean13RejectsWrongCheckDigitAndNamesTheCorrectOne() {
        BarcodeException e = assertThrows(BarcodeException.class,
                () -> BarcodeContent.prepare(BarcodeSymbology.EAN_13, "6901234567899"));
        assertEquals(400, e.getCode());
        assertTrue(e.getMessage().contains("6901234567892"), e.getMessage());
        assertTrue(e.getMessage().contains("末位应为"), e.getMessage());
    }

    @Test
    void ean13RejectsLetters() {
        BarcodeException e = assertThrows(BarcodeException.class,
                () -> BarcodeContent.prepare(BarcodeSymbology.EAN_13, "69012345ABCD"));
        assertTrue(e.getMessage().contains("只能填数字"), e.getMessage());
    }

    @Test
    void ean13RejectsWrongLength() {
        BarcodeException e = assertThrows(BarcodeException.class,
                () -> BarcodeContent.prepare(BarcodeSymbology.EAN_13, "69012345678"));
        assertTrue(e.getMessage().contains("12 位"), e.getMessage());
    }

    @Test
    void inStoreCodesAreAccepted() {
        // 生鲜称重码 20~29 开头是合法店内码，不能因为不是 69 就拒绝
        var p = BarcodeContent.prepare(BarcodeSymbology.EAN_13, "201234567890");
        assertEquals(13, p.text().length());
        assertTrue(ChecksumUtil.isValidGs1(p.text()));
    }

    @Test
    void spacesAndHyphensAreTolerated() {
        var p = BarcodeContent.prepare(BarcodeSymbology.EAN_13, "690 1234 56789");
        assertEquals("6901234567892", p.text());
    }

    @Test
    void code128AcceptsPrintableAscii() {
        var p = BarcodeContent.prepare(BarcodeSymbology.CODE_128, "SKU-2026/A01");
        assertEquals("SKU-2026/A01", p.text());
    }

    @Test
    void code128RejectsChinese() {
        BarcodeException e = assertThrows(BarcodeException.class,
                () -> BarcodeContent.prepare(BarcodeSymbology.CODE_128, "商品A"));
        assertTrue(e.getMessage().contains("可打印 ASCII"), e.getMessage());
    }

    @Test
    void code39UppercasesAndRejectsIllegalChars() {
        assertEquals("AB-123", BarcodeContent.prepare(BarcodeSymbology.CODE_39, "ab-123").text());
        assertThrows(BarcodeException.class,
                () -> BarcodeContent.prepare(BarcodeSymbology.CODE_39, "A*B"));
    }

    @Test
    void emptyContentIsRejected() {
        assertThrows(BarcodeException.class,
                () -> BarcodeContent.prepare(BarcodeSymbology.EAN_13, "   "));
    }

    @Test
    void unsupportedSymbologyIsRejectedInsteadOfSilentlyFallingBack() {
        BarcodeException e = assertThrows(BarcodeException.class,
                () -> BarcodeSymbology.parse("PDF_417"));
        assertEquals(400, e.getCode());
        assertTrue(e.getMessage().contains("EAN-13"), e.getMessage());
    }

    @Test
    void symbologyParsingIsLenient() {
        assertEquals(BarcodeSymbology.EAN_13, BarcodeSymbology.parse("ean-13"));
        assertEquals(BarcodeSymbology.CODE_128, BarcodeSymbology.parse("code128"));
        assertEquals(BarcodeSymbology.EAN_13, BarcodeSymbology.parse(null));
    }
}
