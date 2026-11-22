package me.getcoinio.widget.core

import java.net.URI
import java.net.URLDecoder

/** Where Coinio runs (scheme://host[:port]) and the read-only key the widget uses. */
data class Setup(val origin: String, val key: String)

/** Reads `coinio-widget://setup?url=<origin>&key=<read key>` (from the QR code in Coinio's settings); null otherwise. */
fun parseSetupLink(link: String): Setup? {
    val uri = runCatching { URI(link.trim()) }.getOrNull() ?: return null
    if (uri.scheme != "coinio-widget" || uri.host != "setup") return null
    val query = uri.rawQuery ?: return null
    val params = query.split('&').mapNotNull {
        val i = it.indexOf('=')
        if (i <= 0) null else it.substring(0, i) to URLDecoder.decode(it.substring(i + 1), "UTF-8")
    }.toMap()
    val key = params["key"]?.trim().orEmpty()
    val origin = params["url"]?.let(::originOf) ?: return null
    return if (key.isEmpty()) null else Setup(origin, key)
}

/** `https://host:port` of an http(s) address, without path or trailing slash; null for anything else. */
fun originOf(address: String): String? {
    val u = runCatching { URI(address.trim()) }.getOrNull() ?: return null
    if (u.scheme != "http" && u.scheme != "https" || u.host.isNullOrEmpty()) return null
    return buildString {
        append(u.scheme).append("://").append(u.host)
        if (u.port != -1) append(':').append(u.port)
    }
}

/** True when a phone on mobile data probably cannot open this address (plain http, localhost, a private network). */
fun Setup.unreachableFromPhone(): Boolean {
    val u = URI(origin)
    val h = u.host ?: return true
    return u.scheme != "https" ||
        h == "localhost" || h.endsWith(".local") || h.endsWith(".lan") ||
        h.startsWith("127.") || h.startsWith("10.") || h.startsWith("192.168.") ||
        Regex("""^172\.(1[6-9]|2\d|3[01])\.""").containsMatchIn(h) ||
        !h.contains('.')
}
