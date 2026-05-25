package com.TheVoteApp.data.network

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import dagger.hilt.android.qualifiers.ApplicationContext
import okhttp3.OkHttpClient
import java.net.InetSocketAddress
import java.net.Proxy
import javax.inject.Inject
import javax.inject.Singleton

/**
 * TorProxyManager — optional Tor/onion routing for anonymous API access.
 *
 * Routes all API traffic through Orbot (Guardian Project) SOCKS5 proxy
 * when available. Falls back transparently to direct connection if
 * Orbot is not installed or not running.
 *
 * Usage:
 *   The app detects Orbot availability at launch. A settings toggle lets
 *   the user opt in to Tor routing for enhanced metadata privacy.
 *
 * Onion address is loaded from the backend gateway manifest — the .onion
 * address is embedded alongside the HTTPS endpoint so Tor users resolve
 * it automatically.
 */
@Singleton
class TorProxyManager @Inject constructor(
    @ApplicationContext private val context: Context
) {
    companion object {
        private const val ORBOT_PACKAGE   = "org.torproject.android"
        private const val TOR_HOST        = "127.0.0.1"
        private const val TOR_SOCKS_PORT  = 9050
        private const val TOR_HTTP_PORT   = 8118
    }

    val isOrbotInstalled: Boolean get() =
        try {
            context.packageManager.getPackageInfo(ORBOT_PACKAGE, 0)
            true
        } catch (_: PackageManager.NameNotFoundException) { false }

    /** Start Orbot via implicit Intent if installed. */
    fun requestOrbotStart() {
        if (!isOrbotInstalled) return
        val intent = Intent("org.torproject.android.intent.action.START")
            .setPackage(ORBOT_PACKAGE)
            .putExtra("org.torproject.android.intent.extra.PACKAGE_NAME", context.packageName)
        context.startService(intent)
    }

    /**
     * Build an OkHttpClient routed through the Tor SOCKS5 proxy.
     * Use this client for all API calls when Tor mode is active.
     */
    fun buildTorOkHttpClient(baseBuilder: OkHttpClient.Builder): OkHttpClient {
        val proxy = Proxy(Proxy.Type.SOCKS, InetSocketAddress(TOR_HOST, TOR_SOCKS_PORT))
        return baseBuilder.proxy(proxy).build()
    }

    /**
     * Build an OkHttpClient routed through the Tor HTTP CONNECT proxy.
     * Alternative to SOCKS — useful for environments where SOCKS is blocked.
     */
    fun buildTorHttpProxyClient(baseBuilder: OkHttpClient.Builder): OkHttpClient {
        val proxy = Proxy(Proxy.Type.HTTP, InetSocketAddress(TOR_HOST, TOR_HTTP_PORT))
        return baseBuilder.proxy(proxy).build()
    }
}
