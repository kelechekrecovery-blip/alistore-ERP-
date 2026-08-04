package kg.alistore.core

import org.junit.Assert.assertEquals
import org.junit.Test

class StaffScannerTest {
  @Test
  fun scannerInputRemovesReaderLineEndingsAndOuterWhitespace() {
    assertEquals("359876543210123", normalizeStaffCode("  359876543210123\r\n"))
    assertEquals("EAN-123", normalizeStaffCode("EAN-123\n"))
  }
}
