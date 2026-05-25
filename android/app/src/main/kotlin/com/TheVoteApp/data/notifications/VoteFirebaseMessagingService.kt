package com.TheVoteApp.data.notifications

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import com.TheVoteApp.R
import com.TheVoteApp.data.remote.VoteApiClient
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Firebase Cloud Messaging service — receives push notifications.
 *
 * Notification payloads contain only (event, policyId) — no vote content
 * or personal data is ever transmitted in push notification payloads.
 */
@AndroidEntryPoint
class VoteFirebaseMessagingService : FirebaseMessagingService() {

    @Inject lateinit var apiClient: VoteApiClient

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    companion object {
        const val CHANNEL_ID = "vote_notifications"
        const val CHANNEL_NAME = "Voting Notifications"
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    /**
     * Called when a new FCM token is generated (first install or token refresh).
     * Registers the token with the backend.
     */
    override fun onNewToken(token: String) {
        serviceScope.launch {
            val userId = getSharedPreferences("auth", Context.MODE_PRIVATE)
                .getString("userId", null) ?: return@launch
            val countryCode = getSharedPreferences("auth", Context.MODE_PRIVATE)
                .getString("countryCode", "US") ?: "US"
            runCatching {
                apiClient.post(
                    "/api/v1/notifications/register",
                    mapOf(
                        "userId"      to userId,
                        "token"       to token,
                        "platform"    to "android",
                        "countryCode" to countryCode
                    )
                )
            }
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val title = message.notification?.title ?: return
        val body  = message.notification?.body ?: ""
        val policyId = message.data["policyId"]

        val pendingIntent = PendingIntent.getActivity(
            this, 0,
            policyId?.let { buildDeepLinkIntent(it) } ?: packageManager.getLaunchIntentForPackage(packageName)!!,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build()

        val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(System.currentTimeMillis().toInt(), notification)
    }

    private fun buildDeepLinkIntent(policyId: String): Intent =
        packageManager.getLaunchIntentForPackage(packageName)!!.apply {
            putExtra("policyId", policyId)
            addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
        }

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_DEFAULT
        ).apply { description = "Notifications about open votes and results" }
        (getSystemService(NOTIFICATION_SERVICE) as NotificationManager)
            .createNotificationChannel(channel)
    }
}
