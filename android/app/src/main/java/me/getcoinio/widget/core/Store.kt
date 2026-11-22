package me.getcoinio.widget.core

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import java.io.File

/** The connection (address + read key), encrypted with a key kept in the Android Keystore. */
class SetupStore(private val context: Context) {
    private val prefs: SharedPreferences by lazy {
        EncryptedSharedPreferences.create(
            "coinio-setup",
            MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC),
            context,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    fun get(): Setup? {
        val origin = prefs.getString("origin", null) ?: return null
        val key = prefs.getString("key", null) ?: return null
        return Setup(origin, key)
    }

    fun save(setup: Setup) = prefs.edit { putString("origin", setup.origin).putString("key", setup.key) }

    /** Forgets the connection and the cached data that came with it. */
    fun clear() {
        prefs.edit { clear() }
        FileCache(context).clear()
    }
}

/** The last answer as a file in the app's private storage. */
class FileCache(context: Context) : PayloadCache {
    private val file = File(context.filesDir, "widget.json")
    override fun read(): String? = file.takeIf { it.exists() }?.readText()
    override fun write(json: String) = file.writeText(json)
    fun clear() { file.delete() }
}
