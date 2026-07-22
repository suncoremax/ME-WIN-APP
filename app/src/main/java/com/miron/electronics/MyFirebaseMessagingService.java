package com.miron.electronics;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.io.InputStream;
import java.net.URL;
import java.util.Map;
import java.util.Random;

/**
 * Receives every push message sent from the web app's backend through
 * Firebase Cloud Messaging and turns it into an Android notification.
 *
 * See PUSH_NOTIFICATIONS.md for the exact JSON payload your backend/web
 * dev should send — this class is written to match that spec.
 */
public class MyFirebaseMessagingService extends FirebaseMessagingService {

    private static final String TAG_URL_EXTRA = "notification_url";

    // Latest FCM registration token, cached in memory so
    // AndroidBridge.getFcmToken() (called from the web app's JS) can read
    // it without an extra async round-trip. See MainActivity.
    static volatile String latestToken = null;

    @Override
    public void onNewToken(String token) {
        super.onNewToken(token);
        latestToken = token;
        // Hand the token to the web app in case it wants to target this
        // specific device/user later (optional — see PUSH_NOTIFICATIONS.md,
        // "Targeting a single user" section). Broadcast-only setups that
        // just use the "all_users" topic can ignore this entirely.
        MainActivity.deliverFcmTokenToWeb(token);
    }

    @Override
    public void onMessageReceived(RemoteMessage message) {
        super.onMessageReceived(message);

        Map<String, String> data = message.getData();

        String title = data.get("title");
        String body = data.get("body");
        String url = data.get("url");
        String imageUrl = data.get("image");
        String channelId = data.get("channel_id");

        // Fall back to the "notification" block if the backend sent one
        // instead of (or in addition to) plain data fields.
        if (message.getNotification() != null) {
            if (title == null) title = message.getNotification().getTitle();
            if (body == null) body = message.getNotification().getBody();
        }

        if (title == null) title = getString(R.string.app_name);
        if (body == null) body = "";
        if (channelId == null) channelId = getString(R.string.default_notification_channel_id);

        showNotification(title, body, url, imageUrl, channelId);
    }

    private void showNotification(String title, String body, String url,
                                   String imageUrl, String channelId) {

        ensureChannelExists(channelId);

        Intent intent = new Intent(this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        if (url != null && !url.isEmpty()) {
            intent.putExtra(TAG_URL_EXTRA, url);
        }

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pendingIntent = PendingIntent.getActivity(this, new Random().nextInt(),
                intent, flags);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, channelId)
                .setSmallIcon(R.drawable.ic_notification)
                .setColor(ContextCompat.getColor(this, R.color.notification_accent))
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setContentIntent(pendingIntent);

        // Optional big image (e.g. a product photo / offer banner) —
        // downloaded synchronously since this already runs off the main
        // thread inside FirebaseMessagingService.
        if (imageUrl != null && !imageUrl.isEmpty()) {
            Bitmap bmp = tryDownloadBitmap(imageUrl);
            if (bmp != null) {
                builder.setLargeIcon(bmp);
                builder.setStyle(new NotificationCompat.BigPictureStyle()
                        .bigPicture(bmp)
                        .setSummaryText(body));
            }
        }

        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.notify((int) System.currentTimeMillis(), builder.build());
        }
    }

    private Bitmap tryDownloadBitmap(String urlStr) {
        try (InputStream in = new URL(urlStr).openStream()) {
            return BitmapFactory.decodeStream(in);
        } catch (Exception e) {
            return null;
        }
    }

    private void ensureChannelExists(String channelId) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null || nm.getNotificationChannel(channelId) != null) return;

        NotificationChannel channel = new NotificationChannel(
                channelId,
                getString(R.string.default_notification_channel_name),
                NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription(getString(R.string.default_notification_channel_desc));
        nm.createNotificationChannel(channel);
    }
}
