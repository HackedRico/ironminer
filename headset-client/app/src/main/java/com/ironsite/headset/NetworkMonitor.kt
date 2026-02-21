package com.ironsite.headset

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.util.Log

private const val TAG = "NetworkMonitor"

/**
 * NetworkMonitor — watches for network changes and triggers reconnection.
 *
 * Construction sites frequently have intermittent WiFi (concrete walls,
 * large equipment interference) and workers may move in/out of coverage.
 * This monitor detects when connectivity is restored and tells
 * StreamingManager to reconnect.
 */
class NetworkMonitor(
    private val context: Context,
    private val onNetworkAvailable: () -> Unit,
    private val onNetworkLost: () -> Unit,
) {
    private val connectivityManager =
        context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

    private val callback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            Log.i(TAG, "Network available: $network")
            onNetworkAvailable()
        }

        override fun onLost(network: Network) {
            Log.w(TAG, "Network lost: $network")
            onNetworkLost()
        }

        override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) {
            val hasInternet = caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            Log.d(TAG, "Network capabilities changed: internet=$hasInternet")
        }
    }

    fun start() {
        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()
        connectivityManager.registerNetworkCallback(request, callback)
        Log.i(TAG, "Network monitoring started")
    }

    fun stop() {
        try {
            connectivityManager.unregisterNetworkCallback(callback)
            Log.i(TAG, "Network monitoring stopped")
        } catch (e: Exception) {
            Log.w(TAG, "Failed to unregister network callback: ${e.message}")
        }
    }
}
