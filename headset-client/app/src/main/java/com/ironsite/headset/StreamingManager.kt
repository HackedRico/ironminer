package com.ironsite.headset

import android.content.Context
import android.util.Log
import io.livekit.android.LiveKit
import io.livekit.android.room.Room
import io.livekit.android.room.RoomListener
import io.livekit.android.room.participant.RemoteParticipant
import io.livekit.android.room.track.Track
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

private const val TAG = "StreamingManager"

/**
 * StreamingManager — owns the LiveKit Room connection for a worker device.
 *
 * Flow:
 *   1. POST /api/workers/register → get room_name
 *   2. POST /api/streaming/livekit/token/worker → get JWT
 *   3. room.connect(livekitUrl, token)
 *   4. Publish camera video + microphone audio
 *   5. Auto-subscribe to manager audio (LiveKit handles this)
 *   6. Auto-reconnect on disconnect
 */
class StreamingManager(
    private val context: Context,
    private val backendUrl: String,
    private val livekitUrl: String,
    val identity: String,
    val displayName: String,
    val siteId: String,
) {
    private var room: Room? = null
    private val scope = CoroutineScope(Dispatchers.Main)
    private val httpClient = OkHttpClient()
    private val JSON = "application/json; charset=utf-8".toMediaType()

    fun connect() {
        scope.launch {
            try {
                // 1. Register with backend — get room_name
                val roomName = registerWorker()

                // 2. Get worker token
                val token = fetchWorkerToken(roomName)

                // 3. Connect to LiveKit
                val lkRoom = LiveKit.create(context)
                lkRoom.listener = object : RoomListener {
                    override fun onDisconnect(room: Room, error: Exception?) {
                        Log.w(TAG, "Disconnected: ${error?.message}")
                        // Reconnect after a brief pause
                        scope.launch {
                            delay(2_000)
                            connect()
                        }
                    }

                    override fun onTrackSubscribed(
                        track: Track,
                        publication: io.livekit.android.room.track.TrackPublication,
                        participant: RemoteParticipant,
                        room: Room
                    ) {
                        // Manager audio auto-plays when subscribed — no extra work needed.
                        // AudioPlaybackManager ensures correct audio routing.
                        Log.d(TAG, "Subscribed to ${track.kind} from ${participant.identity}")
                    }
                }

                lkRoom.connect(livekitUrl, token)
                room = lkRoom

                // 4. Publish camera + mic
                lkRoom.localParticipant.setCameraEnabled(true)
                lkRoom.localParticipant.setMicrophoneEnabled(true)

                Log.i(TAG, "Connected to room $roomName as $identity")
            } catch (e: Exception) {
                Log.e(TAG, "Connection failed: ${e.message}")
                // Retry with exponential backoff
                retryConnect(attempt = 1)
            }
        }
    }

    private suspend fun retryConnect(attempt: Int) {
        val delayMs = minOf(1_000L * (1 shl attempt), 30_000L)  // 2, 4, 8, ... 30s
        Log.i(TAG, "Retrying in ${delayMs}ms (attempt $attempt)")
        delay(delayMs)
        connect()
    }

    fun disconnect() {
        scope.launch {
            room?.disconnect()
            room = null
        }
    }

    /** Called by NetworkMonitor when connectivity is restored. */
    fun reconnect() {
        scope.launch {
            room?.disconnect()
            room = null
            connect()
        }
    }

    // ── Backend API calls ─────────────────────────────────────────────────────

    private fun registerWorker(): String {
        val body = JSONObject().apply {
            put("identity", identity)
            put("display_name", displayName)
            put("site_id", siteId)
        }.toString().toRequestBody(JSON)

        val req = Request.Builder()
            .url("$backendUrl/api/workers/register")
            .post(body)
            .build()

        val resp = httpClient.newCall(req).execute()
        val json = JSONObject(resp.body!!.string())
        return json.getString("room_name")
    }

    private fun fetchWorkerToken(roomName: String): String {
        val body = JSONObject().apply {
            put("room_name", roomName)
            put("identity", identity)
            put("display_name", displayName)
        }.toString().toRequestBody(JSON)

        val req = Request.Builder()
            .url("$backendUrl/api/streaming/livekit/token/worker")
            .post(body)
            .build()

        val resp = httpClient.newCall(req).execute()
        val json = JSONObject(resp.body!!.string())
        return json.getString("token")
    }
}
