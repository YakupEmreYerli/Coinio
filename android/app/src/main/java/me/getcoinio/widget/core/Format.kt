package me.getcoinio.widget.core

import java.math.BigDecimal
import java.text.NumberFormat
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Currency
import java.util.Locale

/** Minor units as money in `locale`, with the payload's decimals for the currency (2 if unknown); whole amounts drop the cents. */
fun money(minor: Long, currency: String, digits: Map<String, Int>, locale: Locale): String {
    val d = digits[currency] ?: 2
    val value = BigDecimal.valueOf(minor).movePointLeft(d)
    val shown = if (minor % pow10(d) == 0L) 0 else d
    return runCatching {
        NumberFormat.getCurrencyInstance(locale).apply {
            this.currency = Currency.getInstance(currency)
            minimumFractionDigits = shown
            maximumFractionDigits = shown
        }.format(value)
    }.getOrElse { "${value.setScale(shown)} $currency" }
}

private fun pow10(n: Int): Long = (1..n).fold(1L) { acc, _ -> acc * 10 }

/** "Nov 25" / "25 Kas": day and short month in `locale`. */
fun shortDate(iso: String, locale: Locale): String =
    LocalDate.parse(iso).format(DateTimeFormatter.ofPattern(if (locale.language == "en") "MMM d" else "d MMM", locale))
