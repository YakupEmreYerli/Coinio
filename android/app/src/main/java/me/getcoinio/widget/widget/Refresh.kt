package me.getcoinio.widget.widget

import android.content.Context
import androidx.core.content.edit
import androidx.glance.appwidget.updateAll
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.getcoinio.widget.core.Client
import me.getcoinio.widget.core.FileCache
import me.getcoinio.widget.core.Load
import me.getcoinio.widget.core.SetupStore

/** What the last refresh found; the widget and the app draw from it and the cached payload. */
enum class Status { NOT_CONNECTED, FRESH, OFFLINE, AUTH_REJECTED, UNREACHABLE }

object WidgetState {
    private fun prefs(context: Context) = context.getSharedPreferences("coinio-widget-state", Context.MODE_PRIVATE)

    fun status(context: Context): Status =
        runCatching { Status.valueOf(prefs(context).getString("status", null)!!) }.getOrDefault(Status.NOT_CONNECTED)

    /** When the shown data was fetched (millis), for the "offline · 14:05" note. */
    fun fetchedAt(context: Context): Long = prefs(context).getLong("fetchedAt", 0)

    fun save(context: Context, status: Status, fetched: Boolean) = prefs(context).edit {
        putString("status", status.name)
        if (fetched) putLong("fetchedAt", System.currentTimeMillis())
    }
}

/** Fetches once and redraws every widget. Safe to call from the app and from the worker. */
suspend fun refreshNow(context: Context) {
    withContext(Dispatchers.IO) {
        val setup = SetupStore(context).get()
        if (setup == null) {
            WidgetState.save(context, Status.NOT_CONNECTED, fetched = false)
        } else {
            when (Client().load(setup, FileCache(context))) {
                is Load.Fresh -> WidgetState.save(context, Status.FRESH, fetched = true)
                is Load.Offline -> WidgetState.save(context, Status.OFFLINE, fetched = false)
                Load.AuthRejected -> WidgetState.save(context, Status.AUTH_REJECTED, fetched = false)
                Load.Unreachable -> WidgetState.save(context, Status.UNREACHABLE, fetched = false)
            }
        }
    }
    CoinioWidget().updateAll(context)
}

/** About every 30 minutes while there is a network; Android decides the exact moment. */
fun scheduleRefresh(context: Context) {
    val request = PeriodicWorkRequestBuilder<RefreshWorker>(30, TimeUnit.MINUTES)
        .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
        .build()
    WorkManager.getInstance(context).enqueueUniquePeriodicWork("coinio-refresh", ExistingPeriodicWorkPolicy.KEEP, request)
}

class RefreshWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        refreshNow(applicationContext)
        return Result.success()
    }
}
