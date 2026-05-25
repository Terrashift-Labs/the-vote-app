package com.TheVoteApp.data.blockchain

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Stores the ephemeral session private key in AES-256-GCM encrypted
 * SharedPreferences backed by the Android Keystore.
 *
 * The key is cleared when the user logs out or the session expires.
 * It is NEVER written to disk in plaintext.
 */
@Singleton
class EncryptedKeyStore @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val prefs by lazy {
        EncryptedSharedPreferences.create(
            context,
            "vote_global_session",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    fun saveSessionKey(privateKeyBytes: ByteArray) {
        val hex = privateKeyBytes.joinToString("") { "%02x".format(it) }
        prefs.edit().putString(KEY_SESSION, hex).apply()
    }

    fun loadSessionKey(): ByteArray? {
        val hex = prefs.getString(KEY_SESSION, null) ?: return null
        return hex.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
    }

    fun clearSessionKey() {
        prefs.edit().remove(KEY_SESSION).apply()
    }

    companion object {
        private const val KEY_SESSION = "ephemeral_session_key"
    }
}
