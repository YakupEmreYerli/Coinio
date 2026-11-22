package me.getcoinio.widget.core

import kotlin.math.floor

private const val PADDING_DP = 28f
private const val HEADER_DP = 58f
private const val ROW_DP = 20f
private const val ROW_WITH_DAY_DP = 32f
const val MAX_ROWS = 6

/** How many whole payment rows fit in a widget this tall (never half a row). */
fun rowCount(heightDp: Float, withRelativeDay: Boolean): Int {
    val free = heightDp - PADDING_DP - HEADER_DP
    if (free <= 0f) return 0
    return floor(free / if (withRelativeDay) ROW_WITH_DAY_DP else ROW_DP).toInt().coerceAtMost(MAX_ROWS)
}
