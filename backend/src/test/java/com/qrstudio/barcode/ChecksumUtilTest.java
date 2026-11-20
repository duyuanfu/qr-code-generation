package com.qrstudio.barcode;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 校验位算错一个数字，整张标签就是废的 —— 而且人眼完全看不出来。
 * 用已知向量钉死算法，包括「错一位必须被拒」。
 */
class ChecksumUtilTest {

    @Test
    void knownVectorEan13() {
        assertEquals(2, ChecksumUtil.gs1CheckDigit("690123456789"));
        assertTrue(ChecksumUtil.isValidGs1("6901234567892"));
    }

    @Test
    void wrongCheckDigitIsRejected() {
        assertFalse(ChecksumUtil.isValidGs1("6901234567893"));
        assertFalse(ChecksumUtil.isValidGs1("6901234567890"));
    }

    @Test
    void upcAAndEan8Vectors() {
        // UPC-A 0-12345-67890-5
        assertEquals(5, ChecksumUtil.gs1CheckDigit("01234567890"));
        assertTrue(ChecksumUtil.isValidGs1("012345678905"));
        // EAN-8 6901234 -> 1
        assertEquals(1, ChecksumUtil.gs1CheckDigit("6901234"));
        assertTrue(ChecksumUtil.isValidGs1("69012341"));
    }

    @Test
    void nonDigitInputFailsLoudly() {
        assertThrows(IllegalArgumentException.class, () -> ChecksumUtil.gs1CheckDigit("69O123"));
    }
}
