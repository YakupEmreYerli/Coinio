package me.getcoinio.widget.core

enum class Bucket(val rows: Int) { SMALL(1), MEDIUM(4), LARGE(6) }

/** The payments a widget of this size lists, in the payload's order (overdue first). */
fun rowsFor(bucket: Bucket, payload: WidgetPayload): List<WidgetItem> = payload.items.take(bucket.rows)
