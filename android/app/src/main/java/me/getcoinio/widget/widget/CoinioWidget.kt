package me.getcoinio.widget.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.LocalSize
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.action.actionStartActivity
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.currentState
import androidx.glance.state.PreferencesGlanceStateDefinition
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.glance.background
import androidx.glance.color.ColorProvider
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import java.text.DateFormat
import java.util.Date
import java.util.Locale
import me.getcoinio.widget.R
import me.getcoinio.widget.core.FileCache
import me.getcoinio.widget.core.WidgetItem
import me.getcoinio.widget.core.WidgetPayload
import me.getcoinio.widget.core.money
import me.getcoinio.widget.core.parsePayload
import me.getcoinio.widget.core.rowCount
import me.getcoinio.widget.core.shortDate
import me.getcoinio.widget.ui.MainActivity

private val WIDE = 250.dp
private val TALL = 250.dp

internal object Palette {
    val surface = ColorProvider(day = Color(0xFFFFFFFF), night = Color(0xFF1C1C1E))
    val text = ColorProvider(day = Color(0xFF14152A), night = Color(0xFFFFFFFF))
    val muted = ColorProvider(day = Color(0xFF6B6F86), night = Color(0xB3FFFFFF))
    val accent = ColorProvider(day = Color(0xFF4F5BD5), night = Color(0xFF9EA3FF))
    val rule = ColorProvider(day = Color(0xFF4F5BD5), night = Color(0xFF4F5BD5))
    val late = ColorProvider(day = Color(0xFFE5484D), night = Color(0xFFFF6369))
}

/** Text for a row's day: "today", "tomorrow", "in 3d", "2d late". */
internal fun relativeDay(context: Context, daysLeft: Int): String = when {
    daysLeft == 0 -> context.getString(R.string.today)
    daysLeft == 1 -> context.getString(R.string.tomorrow)
    daysLeft < 0 -> context.resources.getQuantityString(R.plurals.days_late, -daysLeft, -daysLeft)
    else -> context.resources.getQuantityString(R.plurals.in_days, daysLeft, daysLeft)
}

class CoinioWidget : GlanceAppWidget() {
    // Exact: the real size, so the row count matches the space and no row is cut in half.
    override val sizeMode = SizeMode.Exact

    override val stateDefinition = PreferencesGlanceStateDefinition

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        provideContent {
            // Read on every recomposition: refreshNow() bumps VERSION so a running session redraws with new data.
            currentState(VERSION)
            val status = WidgetState.status(context)
            val payload = FileCache(context).read()?.let { runCatching { parsePayload(it) }.getOrNull() }
            Content(context, status, payload, WidgetState.fetchedAt(context))
        }
    }

    companion object {
        val VERSION = longPreferencesKey("version")
    }
}

@Composable
private fun Content(context: Context, status: Status, payload: WidgetPayload?, fetchedAt: Long) {
    val size = LocalSize.current
    // Rows follow the height; dates need the width (a narrow but tall widget lists amounts only).
    val wide = size.width >= WIDE
    val withDay = wide && size.height >= TALL
    val small = size.height < 150.dp && !wide
    val locale = Locale.getDefault()
    Box(
        modifier = GlanceModifier.fillMaxSize().background(Palette.surface).cornerRadius(22.dp).padding(14.dp)
            .clickable(actionStartActivity<MainActivity>()),
    ) {
        val message = when {
            status == Status.NOT_CONNECTED -> context.getString(R.string.not_connected)
            status == Status.AUTH_REJECTED -> context.getString(R.string.auth)
            payload == null -> context.getString(R.string.unreachable)
            else -> null
        }
        if (message != null || payload == null) {
            Text(message ?: "", style = TextStyle(color = Palette.muted, fontSize = 12.sp))
            return@Box
        }
        Column(modifier = GlanceModifier.fillMaxSize()) {
            Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(context.getString(R.string.left).uppercase(locale), style = TextStyle(color = Palette.accent, fontSize = 10.sp, fontWeight = FontWeight.Medium))
                if (status != Status.FRESH) {
                    val at = if (fetchedAt > 0 && wide) " · " + DateFormat.getTimeInstance(DateFormat.SHORT, locale).format(Date(fetchedAt)) else ""
                    Spacer(GlanceModifier.defaultWeight())
                    Text(context.getString(R.string.offline) + at, style = TextStyle(color = Palette.muted, fontSize = 10.sp))
                }
            }
            Text(
                money(payload.leftThisMonthMinor, payload.base, payload.digits, locale),
                style = TextStyle(color = Palette.text, fontSize = if (small) 21.sp else 24.sp, fontWeight = FontWeight.Bold),
            )
            Spacer(GlanceModifier.height(4.dp))
            Box(GlanceModifier.fillMaxWidth().height(1.dp).background(Palette.rule)) {}
            Spacer(GlanceModifier.height(4.dp))
            // Rows in a column of their own: Glance draws at most 10 children per container.
            val rows = payload.items.take(rowCount(size.height.value, withDay))
            Column(modifier = GlanceModifier.fillMaxWidth()) {
                if (rows.isEmpty()) Text(context.getString(R.string.none), style = TextStyle(color = Palette.muted, fontSize = 12.sp))
                rows.forEach { ItemRow(context, it, payload, wide, withDay, locale) }
            }
        }
    }
}

@Composable
private fun ItemRow(context: Context, item: WidgetItem, payload: WidgetPayload, wide: Boolean, withDay: Boolean, locale: Locale) {
    val late = item.daysLeft < 0
    Column(modifier = GlanceModifier.fillMaxWidth().padding(vertical = 2.dp)) {
        Row(modifier = GlanceModifier.fillMaxWidth()) {
            Text(
                item.name,
                maxLines = 1,
                modifier = GlanceModifier.defaultWeight(),
                style = TextStyle(color = if (late) Palette.late else Palette.text, fontSize = 12.sp, fontWeight = FontWeight.Medium),
            )
            val amount = money(item.amountMinor, item.currency, payload.digits, locale)
            Text(
                if (wide) "${shortDate(item.dueDate, locale)} · $amount" else amount,
                maxLines = 1,
                style = TextStyle(color = Palette.muted, fontSize = 11.sp),
            )
        }
        if (withDay) {
            Text(relativeDay(context, item.daysLeft), style = TextStyle(color = if (late) Palette.late else Palette.muted, fontSize = 10.sp))
        }
    }
}

class CoinioWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = CoinioWidget()

    override fun onEnabled(context: Context) {
        super.onEnabled(context)
        scheduleRefresh(context)
    }
}
