package me.getcoinio.widget.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.DpSize
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
import me.getcoinio.widget.core.Bucket
import me.getcoinio.widget.core.FileCache
import me.getcoinio.widget.core.WidgetItem
import me.getcoinio.widget.core.WidgetPayload
import me.getcoinio.widget.core.money
import me.getcoinio.widget.core.parsePayload
import me.getcoinio.widget.core.rowsFor
import me.getcoinio.widget.core.shortDate
import me.getcoinio.widget.ui.MainActivity

private val SMALL = DpSize(110.dp, 110.dp)
private val MEDIUM = DpSize(250.dp, 110.dp)
private val LARGE = DpSize(250.dp, 250.dp)

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
    override val sizeMode = SizeMode.Responsive(setOf(SMALL, MEDIUM, LARGE))

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val status = WidgetState.status(context)
        val payload = FileCache(context).read()?.let { runCatching { parsePayload(it) }.getOrNull() }
        val fetchedAt = WidgetState.fetchedAt(context)
        provideContent { Content(context, status, payload, fetchedAt) }
    }
}

@Composable
private fun Content(context: Context, status: Status, payload: WidgetPayload?, fetchedAt: Long) {
    val size = LocalSize.current
    val bucket = when {
        size.height >= LARGE.height -> Bucket.LARGE
        size.width >= MEDIUM.width -> Bucket.MEDIUM
        else -> Bucket.SMALL
    }
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
                if (status != Status.FRESH && bucket != Bucket.SMALL) {
                    val at = if (fetchedAt > 0) " · " + DateFormat.getTimeInstance(DateFormat.SHORT, locale).format(Date(fetchedAt)) else ""
                    Spacer(GlanceModifier.defaultWeight())
                    Text(context.getString(R.string.offline) + at, style = TextStyle(color = Palette.muted, fontSize = 10.sp))
                }
            }
            Text(
                money(payload.leftThisMonthMinor, payload.base, payload.digits, locale),
                style = TextStyle(color = Palette.text, fontSize = if (bucket == Bucket.SMALL) 21.sp else 24.sp, fontWeight = FontWeight.Bold),
            )
            Spacer(GlanceModifier.height(4.dp))
            Box(GlanceModifier.fillMaxWidth().height(1.dp).background(Palette.rule)) {}
            Spacer(GlanceModifier.height(4.dp))
            val rows = rowsFor(bucket, payload)
            if (rows.isEmpty()) Text(context.getString(R.string.none), style = TextStyle(color = Palette.muted, fontSize = 12.sp))
            rows.forEach { ItemRow(context, it, payload, bucket, locale) }
        }
    }
}

@Composable
private fun ItemRow(context: Context, item: WidgetItem, payload: WidgetPayload, bucket: Bucket, locale: Locale) {
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
                if (bucket == Bucket.SMALL) amount else "${shortDate(item.dueDate, locale)} · $amount",
                maxLines = 1,
                style = TextStyle(color = Palette.muted, fontSize = 11.sp),
            )
        }
        if (bucket == Bucket.LARGE) {
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
