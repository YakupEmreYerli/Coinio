package me.getcoinio.widget.core

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import java.io.File

/** The connection (address + read key), encrypted with a key kept in the Android Keystore. */
class SetupStore(private val context: Context) {
    private val prefs: SharedPreferences by lazy { open() }

    // A file restored or transferred without its Keystore key cannot be decrypted: start over as not connected.
    private fun open(): SharedPreferences = runCatching { create() }.getOrElse {
        context.deleteSharedPreferences(FILE)
        create()
    }

    private fun create(): SharedPreferences =
        EncryptedSharedPreferences.create(
            FILE,
            MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC),
            context,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )

    fun get(): Setup? = runCatching {
        val origin = prefs.getString("origin", null)
        val key = prefs.getString("key", null)
        if (origin != null && key != null) Setup(origin, key) else null
    }.getOrNull()

    fun save(setup: Setup) = prefs.edit { putString("origin", setup.origin).putString("key", setup.key) }

    /** Forgets the connection and the cached data that came with it. */
    fun clear() {
        prefs.edit { clear() }
        FileCache(context).clear()
    }
}

private const val FILE = "coinio-setup"

/** The last answer as a file in the app's private storage. */
class FileCache(context: Context) : PayloadCache {
    private val file = File(context.filesDir, "widget.json")
    override fun read(): String? = file.takeIf { it.exists() }?.readText()
    override fun write(json: String) = file.writeText(json)
    fun clear() { file.delete() }
}
