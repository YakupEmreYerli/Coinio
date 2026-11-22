package me.getcoinio.widget.core

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/** One due payment as `/api/widget` sends it (overdue ones first, negative `daysLeft`). */
@Serializable
data class WidgetItem(val name: String, val dueDate: String, val daysLeft: Int, val amountMinor: Long, val currency: String)

/** The `/api/widget` payload; amounts are minor units, `digits` gives each currency's decimal places. */
@Serializable
data class WidgetPayload(
    val base: String,
    val leftThisMonthMinor: Long,
    val items: List<WidgetItem> = emptyList(),
    val digits: Map<String, Int> = emptyMap(),
    val generatedAt: String? = null,
)

private val json = Json { ignoreUnknownKeys = true }

fun parsePayload(text: String): WidgetPayload = json.decodeFromString(WidgetPayload.serializer(), text)
