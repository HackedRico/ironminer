package com.ironsite.headset

import android.content.Context
import android.util.Log

private const val TAG = "CameraManager"

/**
 * CameraManager — selects the correct camera and configures capture parameters.
 *
 * For helmet cameras, the "forward-facing" camera (what the worker sees) is
 * typically the rear camera on a phone, or could be a dedicated USB camera
 * on an embedded Linux SBC. Adjust getCameraFacing() per hardware.
 *
 * Target: 1280×720 @ 24fps — balances quality vs bandwidth on spotty site WiFi.
 */
class CameraManager(private val context: Context) {

    companion object {
        const val TARGET_WIDTH = 1280
        const val TARGET_HEIGHT = 720
        const val TARGET_FPS = 24
    }

    /**
     * Returns which camera to use.
     * Override this based on the physical headset hardware:
     *   - Phone mounted to hardhat → rear camera faces forward
     *   - Dedicated helmet cam module → may appear as "front" depending on driver
     */
    fun getCameraFacing(): String {
        // TODO: read from device config or build flavor for specific headset hardware
        return "back"   // rear camera = forward-facing when worn on head
    }

    fun getTargetWidth() = TARGET_WIDTH
    fun getTargetHeight() = TARGET_HEIGHT
    fun getTargetFps() = TARGET_FPS

    fun logCameraInfo() {
        Log.i(TAG, "Camera: facing=${getCameraFacing()}, ${TARGET_WIDTH}x${TARGET_HEIGHT}@${TARGET_FPS}fps")
    }
}
