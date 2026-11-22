package me.getcoinio.widget.ui

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.lifecycleScope
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import kotlinx.coroutines.launch
import me.getcoinio.widget.R
import me.getcoinio.widget.core.FileCache
import me.getcoinio.widget.core.Setup
import me.getcoinio.widget.core.SetupStore
import me.getcoinio.widget.core.WidgetPayload
import me.getcoinio.widget.core.parsePayload
import me.getcoinio.widget.core.parseSetupLink
import me.getcoinio.widget.core.shouldHandleLink
import me.getcoinio.widget.widget.Status
import me.getcoinio.widget.widget.WidgetState
import me.getcoinio.widget.widget.refreshNow
import me.getcoinio.widget.widget.scheduleRefresh

class MainActivity : ComponentActivity() {
    private val store by lazy { SetupStore(this) }
    private var setup by mutableStateOf<Setup?>(null)
    private var status by mutableStateOf(Status.NOT_CONNECTED)
    private var payload by mutableStateOf<WidgetPayload?>(null)
    private var fetchedAt by mutableStateOf(0L)
    private var badCode by mutableStateOf(false)

    private val scan = registerForActivityResult(ScanContract()) { result -> result.contents?.let(::connect) }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        if (shouldHandleLink(restored = savedInstanceState != null, intentFlags = intent.flags)) handle(intent)
        setContent {
            CoinioTheme {
                val s = setup
                if (s == null) {
                    ConnectScreen(error = badCode, onScan = ::startScan)
                } else {
                    SummaryScreen(
                        setup = s,
                        status = status,
                        payload = payload,
                        fetchedAt = fetchedAt,
                        onOpen = { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(s.origin))) },
                        onDisconnect = ::disconnect,
                    )
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handle(intent)
    }

    override fun onResume() {
        super.onResume()
        reload()
        if (setup != null) refresh()
    }

    /** Uses the link once, then forgets it so a later recreate cannot connect again after Disconnect. */
    private fun handle(intent: Intent?) {
        val link = intent?.dataString ?: return
        intent.data = null
        connect(link)
    }

    private fun startScan() {
        badCode = false
        scan.launch(
            ScanOptions()
                .setDesiredBarcodeFormats(ScanOptions.QR_CODE)
                .setPrompt(getString(R.string.scan_prompt))
                .setBeepEnabled(false)
                .setOrientationLocked(false),
        )
    }

    private fun connect(link: String) {
        val parsed = parseSetupLink(link)
        if (parsed == null) {
            badCode = true
            return
        }
        badCode = false
        store.save(parsed)
        scheduleRefresh(this)
        reload()
        refresh()
    }

    private fun disconnect() {
        store.clear()
        lifecycleScope.launch {
            refreshNow(this@MainActivity)
            reload()
        }
    }

    private fun refresh() = lifecycleScope.launch {
        refreshNow(this@MainActivity)
        reload()
    }

    private fun reload() {
        setup = store.get()
        status = WidgetState.status(this)
        fetchedAt = WidgetState.fetchedAt(this)
        payload = if (setup == null) null else FileCache(this).read()?.let { runCatching { parsePayload(it) }.getOrNull() }
    }
}
