package com.ironsite.headset

import android.app.*
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

/**
 * StreamingService — foreground service that keeps the stream alive
 * when the app is backgrounded.
 *
 * Android 12+ requires foreground services to declare camera/microphone
 * access types via foregroundServiceType in AndroidManifest.xml.
 *
 * START_STICKY means the OS will restart this service if it's killed
 * (e.g., by low memory), which is critical for uninterrupted streaming.
 */
class StreamingService : Service() {

    companion object {
        const val CHANNEL_ID = "ironsite_streaming"
        const val NOTIF_ID = 1001
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(NOTIF_ID, buildNotification("Connecting to site room..."))

        val app = applicationContext as HeadsetApplication
        app.audioPlaybackManager.configureForStreaming()
        app.streamingManager.connect()

        return START_STICKY
    }

    override fun onDestroy() {
        val app = applicationContext as HeadsetApplication
        app.streamingManager.disconnect()
        app.audioPlaybackManager.releaseAudio()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "IronSite Streaming",
                NotificationManager.IMPORTANCE_LOW  // LOW = no sound, just persistent icon
            ).apply {
                description = "Active while streaming to site manager"
            }
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }

    private fun buildNotification(text: String): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("IronSite Headset")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_menu_camera)
            .setOngoing(true)   // prevents user from dismissing
            .build()
    }
}
