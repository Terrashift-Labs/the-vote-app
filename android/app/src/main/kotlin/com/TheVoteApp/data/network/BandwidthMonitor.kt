package com.TheVoteApp.data.network

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * BandwidthMonitor — detects low-connectivity conditions and signals low-bandwidth mode.
 *
 * Low-bandwidth mode activates when:
 *   • Connected via 2G / EDGE / GPRS (transport type cellular + low bandwidth)
 *   • No unmetered connection available (no Wi-Fi)
 *   • User has manually enabled low-bandwidth mode in settings
 *
 * When active:
 *   • Images are hidden
 *   • API responses use compressed JSON (Accept-Encoding: br, gzip)
 *   • Non-critical background syncs are deferred
 *   • Policy descriptions truncated to first 200 chars
 */
@Singleton
class BandwidthMonitor @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private val _isLowBandwidth = MutableStateFlow(false)
    val isLowBandwidth: StateFlow<Boolean> = _isLowBandwidth.asStateFlow()

    private val connectivityManager =
        context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

    init {
        registerNetworkCallback()
        checkCurrentNetwork()
    }

    private fun registerNetworkCallback() {
        val request = NetworkRequest.Builder()
            .addTransportType(NetworkCapabilities.TRANSPORT_CELLULAR)
            .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
            .build()

        connectivityManager.registerNetworkCallback(request, object : ConnectivityManager.NetworkCallback() {
            override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) {
                _isLowBandwidth.value = detectLowBandwidth(caps)
            }
            override fun onLost(network: Network) {
                _isLowBandwidth.value = false
            }
        })
    }

    private fun checkCurrentNetwork() {
        val caps = connectivityManager.getNetworkCapabilities(connectivityManager.activeNetwork)
        _isLowBandwidth.value = caps?.let { detectLowBandwidth(it) } ?: false
    }

    private fun detectLowBandwidth(caps: NetworkCapabilities): Boolean {
        val isCellular = caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)
        val isWifi     = caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)
        // Downstream bandwidth < 150 kbps → treat as low-bandwidth
        val lowThroughput = caps.linkDownstreamBandwidthKbps < 150
        return isCellular && !isWifi && lowThroughput
    }

    /** Allow the user to manually override the detection. */
    fun setManualOverride(lowBandwidth: Boolean) {
        _isLowBandwidth.value = lowBandwidth
    }
}
