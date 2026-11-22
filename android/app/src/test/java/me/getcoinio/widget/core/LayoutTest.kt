package me.getcoinio.widget.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LayoutTest {
    @Test fun rowsFitTheRealHeightAndNeverHalfARow() {
        // 28dp padding + 58dp header; a row is 20dp, 32dp with the relative-day line.
        assertEquals(1, rowCount(heightDp = 110f, withRelativeDay = false))
        assertEquals(2, rowCount(heightDp = 130f, withRelativeDay = false))
        assertEquals(4, rowCount(heightDp = 170f, withRelativeDay = false))
        assertEquals(5, rowCount(heightDp = 260f, withRelativeDay = true))
        assertEquals(6, rowCount(heightDp = 400f, withRelativeDay = true))
        assertEquals(0, rowCount(heightDp = 60f, withRelativeDay = false))
    }

    @Test fun aSetupLinkIsUsedOnceNotAgainOnRotationOrFromRecents() {
        val fromHistory = 0x00100000 // Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY
        assertTrue(shouldHandleLink(restored = false, intentFlags = 0))
        assertFalse(shouldHandleLink(restored = true, intentFlags = 0))
        assertFalse(shouldHandleLink(restored = false, intentFlags = fromHistory))
    }
}
