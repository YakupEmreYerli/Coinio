package me.getcoinio.widget.core

import java.util.concurrent.TimeUnit
import okhttp3.OkHttpClient
import okhttp3.Request

/** The last good `/api/widget` answer, shown while offline. */
interface PayloadCache {
    fun read(): String?
    fun write(json: String)
}

sealed interface Load {
    data class Fresh(val payload: WidgetPayload) : Load
    data class Offline(val payload: WidgetPayload) : Load
    /** The key was revoked or is wrong: said plainly, never hidden behind old data. */
    data object AuthRejected : Load
    data object Unreachable : Load
}

class Client(private val http: OkHttpClient = defaultHttp) {
    fun load(setup: Setup, cache: PayloadCache): Load {
        val request = Request.Builder()
            .url("${setup.origin}/api/widget")
            .header("Authorization", "Bearer ${setup.key}")
            .header("Accept", "application/json")
            .build()
        val fresh = runCatching {
            http.newCall(request).execute().use { res ->
                if (res.code == 401 || res.code == 403) return Load.AuthRejected
                if (!res.isSuccessful) error("HTTP ${res.code}")
                val text = res.body?.string().orEmpty()
                parsePayload(text) to text
            }
        }.getOrNull()
        if (fresh != null) {
            cache.write(fresh.second)
            return Load.Fresh(fresh.first)
        }
        val old = cache.read()?.let { runCatching { parsePayload(it) }.getOrNull() }
        return if (old != null) Load.Offline(old) else Load.Unreachable
    }

    companion object {
        val defaultHttp: OkHttpClient = OkHttpClient.Builder().callTimeout(10, TimeUnit.SECONDS).build()
    }
}
