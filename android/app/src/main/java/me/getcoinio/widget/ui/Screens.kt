package me.getcoinio.widget.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.text.DateFormat
import java.util.Date
import java.util.Locale
import me.getcoinio.widget.R
import me.getcoinio.widget.core.Setup
import me.getcoinio.widget.core.WidgetPayload
import me.getcoinio.widget.core.money
import me.getcoinio.widget.core.shortDate
import me.getcoinio.widget.core.unreachableFromPhone
import me.getcoinio.widget.widget.Status
import me.getcoinio.widget.widget.relativeDay

@Composable
private fun Page(content: @Composable () -> Unit) {
    Surface(color = MaterialTheme.colorScheme.background, modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier.systemBarsPadding().verticalScroll(rememberScrollState()).padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) { content() }
    }
}

@Composable
private fun Mark() = Image(painterResource(R.drawable.ic_mark), contentDescription = null, modifier = Modifier.size(56.dp))

@Composable
fun ConnectScreen(error: Boolean, onScan: () -> Unit) = Page {
    Spacer(Modifier.height(24.dp))
    Mark()
    Text(stringResource(R.string.connect_title), fontSize = 26.sp, fontWeight = FontWeight.SemiBold)
    Text(stringResource(R.string.connect_body), color = MaterialTheme.colorScheme.onSurfaceVariant)
    Button(onClick = onScan, modifier = Modifier.fillMaxWidth().height(48.dp)) { Text(stringResource(R.string.scan)) }
    if (error) Text(stringResource(R.string.bad_code), color = MaterialTheme.colorScheme.error)
}

@Composable
fun SummaryScreen(
    setup: Setup,
    status: Status,
    payload: WidgetPayload?,
    fetchedAt: Long,
    onOpen: () -> Unit,
    onDisconnect: () -> Unit,
) = Page {
    val context = LocalContext.current
    val locale = Locale.getDefault()
    var confirm by remember { mutableStateOf(false) }
    Mark()
    Text(stringResource(R.string.connected_to, setup.origin.substringAfter("://")), color = MaterialTheme.colorScheme.onSurfaceVariant)
    if (setup.unreachableFromPhone()) {
        Text(stringResource(R.string.unreachable_note, setup.origin), color = Color(0xFFB45309), fontSize = 14.sp)
    }
    when {
        status == Status.AUTH_REJECTED -> Text(stringResource(R.string.auth), color = MaterialTheme.colorScheme.error)
        payload == null -> Text(stringResource(R.string.unreachable), color = MaterialTheme.colorScheme.error)
        else -> Card(modifier = Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
            Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(stringResource(R.string.left).uppercase(locale), color = MaterialTheme.colorScheme.primary, fontSize = 12.sp, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
                    if (status == Status.OFFLINE && fetchedAt > 0) {
                        Text("${stringResource(R.string.offline)} · ${DateFormat.getTimeInstance(DateFormat.SHORT, locale).format(Date(fetchedAt))}", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                Text(money(payload.leftThisMonthMinor, payload.base, payload.digits, locale), fontSize = 30.sp, fontWeight = FontWeight.Bold)
                HorizontalDivider(color = MaterialTheme.colorScheme.primary)
                if (payload.items.isEmpty()) Text(stringResource(R.string.none), color = MaterialTheme.colorScheme.onSurfaceVariant)
                payload.items.forEach { item ->
                    val late = item.daysLeft < 0
                    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(item.name, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis, color = if (late) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface)
                            Text(relativeDay(context, item.daysLeft), fontSize = 12.sp, color = if (late) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Text("${shortDate(item.dueDate, locale)} · ${money(item.amountMinor, item.currency, payload.digits, locale)}", fontSize = 14.sp)
                    }
                }
            }
        }
    }
    Text(stringResource(R.string.add_widget_hint), fontSize = 14.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
    Button(onClick = onOpen, modifier = Modifier.fillMaxWidth().height(48.dp)) { Text(stringResource(R.string.open_coinio)) }
    OutlinedButton(onClick = { confirm = true }, modifier = Modifier.fillMaxWidth().height(48.dp)) { Text(stringResource(R.string.disconnect)) }
    if (confirm) {
        AlertDialog(
            onDismissRequest = { confirm = false },
            text = { Text(stringResource(R.string.disconnect_confirm)) },
            confirmButton = { TextButton(onClick = { confirm = false; onDisconnect() }) { Text(stringResource(R.string.disconnect)) } },
            dismissButton = { TextButton(onClick = { confirm = false }) { Text(stringResource(R.string.cancel)) } },
        )
    }
}
