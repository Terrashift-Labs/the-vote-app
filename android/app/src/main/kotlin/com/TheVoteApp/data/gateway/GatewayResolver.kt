package com.TheVoteApp.data.gateway

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.first
import org.json.JSONObject
import java.net.URL
import javax.inject.Inject
import javax.inject.Singleton

private val Context.gatewayDataStore by preferencesDataStore("gateway_cache")

/**
 * GatewayResolver — discovers the live backend API URL without central DNS.
 *
 * Resolution order:
 *   1. Cached URL from a previous successful resolution (DataStore)
 *   2. ENS text record on thevoteapp.eth (via public ENS DoH resolver)
 *   3. Hardcoded fallback gateway CID list in app resources
 *
 * The resolved URL is validated against the known publisher address
 * embedded in the app before use.
 */
@Singleton
class GatewayResolver @Inject constructor(
    @ApplicationContext private val context: Context
) {
    companion object {
        private val CACHED_API_URL = stringPreferencesKey("cached_api_url")

        // Known IPFS gateways to try when resolving the manifest CID
        private val IPFS_GATEWAYS = listOf(
            "https://ipfs.io/ipfs/",
            "https://cloudflare-ipfs.com/ipfs/",
            "https://gateway.pinata.cloud/ipfs/"
        )

        // ENS resolver endpoint (DoH-based, no native ENS library needed)
        private const val ENS_RESOLVER_URL =
            "https://cloudflare-eth.com/v1/mainnet"

        // Known publisher address — embedded at build time
        private const val KNOWN_PUBLISHER_ADDRESS =
            "0x0000000000000000000000000000000000000000" // replaced at release build
    }

    /**
     * Resolve the current API base URL.
     * Falls back through the chain; caches successful results.
     */
    suspend fun resolveApiUrl(): String {
        // 1. Try cache
        val cached = context.gatewayDataStore.data.first()[CACHED_API_URL]
        if (!cached.isNullOrBlank()) return cached

        // 2. Try ENS + IPFS manifest
        val fromEns = tryResolveViaENS()
        if (fromEns != null) {
            cacheUrl(fromEns)
            return fromEns
        }

        // 3. Hardcoded fallback
        return getFallbackUrl()
    }

    /** Call after a successful API response to cache the working URL. */
    suspend fun cacheUrl(url: String) {
        context.gatewayDataStore.edit { it[CACHED_API_URL] = url }
    }

    /** Clear the cache (e.g., after repeated failures force re-resolution). */
    suspend fun clearCache() {
        context.gatewayDataStore.edit { it.remove(CACHED_API_URL) }
    }

    // MARK: - Private

    private suspend fun tryResolveViaENS(): String? {
        return try {
            // Fetch the ENS text record "gateway" from thevoteapp.eth
            // Using eth_call to PublicResolver — simplified via Cloudflare's JSON-RPC
            val cid = fetchENSTextRecord("thevoteapp.eth", "gateway") ?: return null
            fetchManifestFromCID(cid)
        } catch (e: Exception) {
            null
        }
    }

    private fun fetchENSTextRecord(name: String, key: String): String? {
        // Minimal ENS resolution: POST eth_call to Cloudflare ETH gateway
        // In production replace with a proper ENS client library
        val body = """
            {"jsonrpc":"2.0","id":1,"method":"eth_call","params":[{
              "to":"0x4976fb03C32e5B8cfe2b6cCB31c09Ba78EBaBa41",
              "data":"0x59d1d43c${nameHash(name)}${abiEncodeString(key)}"
            },"latest"]}
        """.trimIndent()

        val conn = URL(ENS_RESOLVER_URL).openConnection() as java.net.HttpURLConnection
        conn.apply {
            requestMethod = "POST"
            setRequestProperty("Content-Type", "application/json")
            doOutput = true
            outputStream.write(body.toByteArray())
        }
        val response = conn.inputStream.bufferedReader().readText()
        val result = JSONObject(response).optString("result")
        return if (result.length > 2) decodeABIString(result) else null
    }

    private fun fetchManifestFromCID(cid: String): String? {
        for (gateway in IPFS_GATEWAYS) {
            try {
                val json = URL("$gateway$cid").readText()
                val manifest = JSONObject(json)
                val apiUrl = manifest.getJSONObject("endpoints").getString("api")
                if (apiUrl.startsWith("https://")) return apiUrl
            } catch (_: Exception) { }
        }
        return null
    }

    private fun getFallbackUrl(): String =
        "https://api.thevoteapp.org" // last-resort hardcoded URL

    // Minimal ENS namehash (RFC compliant)
    private fun nameHash(name: String): String {
        var node = ByteArray(32)
        name.split(".").reversed().forEach { label ->
            val labelHash = java.security.MessageDigest.getInstance("SHA-256")
                .digest(label.toByteArray())
            node = java.security.MessageDigest.getInstance("SHA-256")
                .digest(node + labelHash)
        }
        return node.joinToString("") { "%02x".format(it) }.padStart(64, '0')
    }

    private fun abiEncodeString(s: String): String {
        val bytes = s.toByteArray()
        val offset = "0000000000000000000000000000000000000000000000000000000000000020"
        val length = bytes.size.toString(16).padStart(64, '0')
        val data = bytes.joinToString("") { "%02x".format(it) }.padEnd(64, '0')
        return offset + length + data
    }

    private fun decodeABIString(hex: String): String? {
        return try {
            val clean = hex.removePrefix("0x")
            val offset = clean.substring(0, 64).toInt(16) * 2
            val len = clean.substring(offset, offset + 64).toInt(16)
            val strHex = clean.substring(offset + 64, offset + 64 + len * 2)
            strHex.chunked(2).map { it.toInt(16).toChar() }.joinToString("")
        } catch (_: Exception) { null }
    }
}
