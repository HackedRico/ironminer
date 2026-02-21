package com.ironsite.headset

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import android.util.Log

private const val TAG = "AudioPlaybackManager"

/**
 * AudioPlaybackManager — configures audio routing for helmet headset playback.
 *
 * Key requirements:
 *   1. MODE_IN_COMMUNICATION — required for WebRTC acoustic echo cancellation (AEC).
 *      Without this, the worker hears their own voice echoed back through the manager.
 *   2. Audio focus — ensures manager audio plays through headset speaker, not competing
 *      with other audio sources.
 *   3. Headset routing — if a wired or BT headset is connected, route through it.
 *      Otherwise use the earpiece (quieter, more private than speakerphone on a site).
 */
class AudioPlaybackManager(private val context: Context) {

    private val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private var focusRequest: AudioFocusRequest? = null

    fun configureForStreaming() {
        // WebRTC AEC requires this mode
        audioManager.mode = AudioManager.MODE_IN_COMMUNICATION

        // Route audio: prefer wired/BT headset, fall back to earpiece
        if (!audioManager.isWiredHeadsetOn && !audioManager.isBluetoothA2dpOn) {
            audioManager.isSpeakerphoneOn = false   // earpiece, not speakerphone
        }

        requestAudioFocus()
        Log.i(TAG, "Audio configured for streaming (mode=IN_COMMUNICATION)")
    }

    fun releaseAudio() {
        audioManager.mode = AudioManager.MODE_NORMAL
        audioManager.isSpeakerphoneOn = false
        abandonAudioFocus()
        Log.i(TAG, "Audio released")
    }

    private fun requestAudioFocus() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val attrs = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build()
            focusRequest = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                .setAudioAttributes(attrs)
                .build()
            audioManager.requestAudioFocus(focusRequest!!)
        } else {
            @Suppress("DEPRECATION")
            audioManager.requestAudioFocus(
                null,
                AudioManager.STREAM_VOICE_CALL,
                AudioManager.AUDIOFOCUS_GAIN_TRANSIENT,
            )
        }
    }

    private fun abandonAudioFocus() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            focusRequest?.let { audioManager.abandonAudioFocusRequest(it) }
        } else {
            @Suppress("DEPRECATION")
            audioManager.abandonAudioFocus(null)
        }
    }
}
