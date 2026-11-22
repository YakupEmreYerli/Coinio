package me.getcoinio.widget.core

import java.util.concurrent.TimeUnit
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class ClientTest {
    private val server = MockWebServer()
    private val body = javaClass.getResource("/widget.json")!!.readText()
    private val client = Client(OkHttpClient.Builder().callTimeout(2, TimeUnit.SECONDS).build())

    private class MemoryCache(var value: String? = null) : PayloadCache {
        override fun read() = value
        override fun write(json: String) { value = json }
    }

    private fun setup() = Setup(server.url("/").toString().trimEnd('/'), "coi_read_x")

    @Before fun start() = server.start()
    @After fun stop() = server.shutdown()

    @Test fun freshDataIsReturnedAndCached() {
        server.enqueue(MockResponse().setBody(body))
        val cache = MemoryCache()
        val result = client.load(setup(), cache)
        assertTrue(result is Load.Fresh)
        assertEquals(6, (result as Load.Fresh).payload.items.size)
        assertEquals(body, cache.value)
        val request = server.takeRequest()
        assertEquals("/api/widget", request.path)
        assertEquals("Bearer coi_read_x", request.getHeader("Authorization"))
    }

    @Test fun aRejectedKeyIsReportedEvenWithOldData() {
        listOf(401, 403).forEach { code ->
            server.enqueue(MockResponse().setResponseCode(code))
            assertEquals(Load.AuthRejected, client.load(setup(), MemoryCache(body)))
        }
    }

    @Test fun withoutAConnectionTheCacheIsShownAsOffline() {
        val s = setup()
        server.shutdown()
        val offline = client.load(s, MemoryCache(body))
        assertTrue(offline is Load.Offline)
        assertEquals("USD", (offline as Load.Offline).payload.base)
        assertEquals(Load.Unreachable, client.load(s, MemoryCache()))
    }

    @Test fun aBrokenAnswerFallsBackToTheCache() {
        server.enqueue(MockResponse().setResponseCode(502).setBody("<html>bad gateway</html>"))
        assertTrue(client.load(setup(), MemoryCache(body)) is Load.Offline)
    }
}
