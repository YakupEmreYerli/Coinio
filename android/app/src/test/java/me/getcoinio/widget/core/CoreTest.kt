package me.getcoinio.widget.core

import java.util.Locale
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CoreTest {
    private fun sample() = parsePayload(javaClass.getResource("/widget.json")!!.readText())

    @Test fun parsesTheSetupLinkAndKeepsOnlyTheOrigin() {
        assertEquals(
            Setup("https://coinio.example.com", "coi_read_x"),
            parseSetupLink("coinio-widget://setup?url=https%3A%2F%2Fcoinio.example.com%2F&key=coi_read_x"),
        )
        assertEquals(
            Setup("http://192.168.1.5:8080", "k"),
            parseSetupLink("coinio-widget://setup?url=http%3A%2F%2F192.168.1.5%3A8080%2Fsettings%2Fintegrations&key=k"),
        )
    }

    @Test fun rejectsOtherLinks() {
        assertNull(parseSetupLink("https://setup?url=https%3A%2F%2Fa.b&key=k"))
        assertNull(parseSetupLink("coinio-widget://other?url=https%3A%2F%2Fa.b&key=k"))
        assertNull(parseSetupLink("coinio-widget://setup?url=https%3A%2F%2Fa.b"))
        assertNull(parseSetupLink("coinio-widget://setup?url=ftp%3A%2F%2Fa.b&key=k"))
        assertNull(parseSetupLink("not a link"))
    }

    @Test fun knowsWhichAddressesAPhoneCannotOpenFromAnywhere() {
        listOf("http://coinio.example.com", "https://localhost:8080", "https://192.168.1.20", "https://10.0.0.5", "https://172.20.0.1", "https://nas.local", "https://nas")
            .forEach { assertTrue(it, Setup(it, "k").unreachableFromPhone()) }
        assertFalse(Setup("https://coinio.example.com", "k").unreachableFromPhone())
    }

    @Test fun readsARealWidgetPayload() {
        val p = sample()
        assertEquals("USD", p.base)
        assertEquals(3549L, p.leftThisMonthMinor)
        assertEquals(6, p.items.size)
        assertEquals("Netflix", p.items[0].name)
        assertEquals(3, p.items[0].daysLeft)
        assertEquals(2, p.digits["USD"])
    }

    @Test fun formatsMoneyWithThePayloadsDigitsAndDropsZeroCents() {
        assertEquals("￥150,000", money(150000, "JPY", mapOf("JPY" to 0), Locale.JAPAN))
        assertEquals("$15", money(1500, "USD", mapOf("USD" to 2), Locale.US))
        assertEquals("$15.49", money(1549, "USD", mapOf("USD" to 2), Locale.US))
        assertEquals("$15.49", money(1549, "USD", emptyMap(), Locale.US))
    }

    @Test fun shortDates() {
        assertEquals("Nov 25", shortDate("2026-11-25", Locale.US))
        assertEquals("25 Kas", shortDate("2026-11-25", Locale.forLanguageTag("tr")))
    }

    @Test fun rowsPerWidgetSize() {
        val p = sample()
        assertEquals(1, rowsFor(Bucket.SMALL, p).size)
        assertEquals(4, rowsFor(Bucket.MEDIUM, p).size)
        assertEquals(6, rowsFor(Bucket.LARGE, p).size)
        assertEquals(listOf("Netflix"), rowsFor(Bucket.SMALL, p).map { it.name })
        assertEquals(emptyList<WidgetItem>(), rowsFor(Bucket.LARGE, p.copy(items = emptyList())))
    }
}
