package com.ironsite.headset

import android.app.Application

class HeadsetApplication : Application() {

    lateinit var streamingManager: StreamingManager
    lateinit var audioPlaybackManager: AudioPlaybackManager

    // Configuration — set these from your deployment environment or build config
    val backendUrl: String = "http://10.0.2.2:8000"    // localhost from Android emulator
    val livekitUrl: String = "ws://10.0.2.2:7880"      // LiveKit server
    val siteId: String = "s1"                           // assigned site
    val workerId: String = "worker-headset-1"
    val workerName: String = "Headset Worker"

    override fun onCreate() {
        super.onCreate()
        audioPlaybackManager = AudioPlaybackManager(this)
        streamingManager = StreamingManager(
            context = this,
            backendUrl = backendUrl,
            livekitUrl = livekitUrl,
            identity = workerId,
            displayName = workerName,
            siteId = siteId,
        )
    }
}
