package com.miron.electronics;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.IntentSender;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Base64;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.ValueCallback;
import android.widget.Toast;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.print.PrintHelper;

import com.google.android.gms.common.api.ResolvableApiException;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.LocationSettingsRequest;
import com.google.android.gms.location.LocationSettingsResponse;
import com.google.android.gms.location.Priority;
import com.google.android.gms.tasks.Task;
import com.google.firebase.messaging.FirebaseMessaging;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends Activity {

    private static final String APP_URL = "https://stock-apk-me.vercel.app/";
    private static final String LOCAL_NO_INTERNET = "file:///android_asset/no_internet.html";
    private static final String LOCAL_MAINTENANCE = "file:///android_asset/maintenance.html";

    private static final int FILE_CHOOSER_REQUEST = 100;
    private static final int LOCATION_PERMISSION_REQUEST = 200;
    private static final int LOCATION_SETTINGS_REQUEST = 300;
    private static final int EXTRA_PERMISSIONS_REQUEST = 400;
    private static final int MEDIA_PERMISSION_REQUEST = 500;

    private WebView webView;
    private static MainActivity instance;
    private ValueCallback<Uri[]> fileChooserCallback;

    // FCM topic every install auto-subscribes to. Sending a push to this
    // topic (instead of a specific device token) reaches every phone with
    // the app installed — the simplest way to broadcast an offer/update.
    // See PUSH_NOTIFICATIONS.md.
    private static final String FCM_BROADCAST_TOPIC = "all_users";

    // Pending web geolocation request while we wait for the OS permission dialog
    private String pendingGeoOrigin;
    private GeolocationPermissions.Callback pendingGeoCallback;

    // Pending web camera/mic request (getUserMedia) while we wait for OS permission
    private PermissionRequest pendingWebPermissionRequest;

    // "Press back again to exit" timer, same pattern most apps use
    private long lastBackPressAt = 0L;

    private ConnectivityManager connectivityManager;
    private ConnectivityManager.NetworkCallback networkCallback;

    // Which local fallback screen (if any) is currently showing
    private enum ScreenState { APP, NO_INTERNET, MAINTENANCE }
    private ScreenState currentScreen = ScreenState.APP;

    // ── JS Bridge: called by the web app ──
    public class AndroidBridge {

        // Save JPG to gallery and return the Uri for sharing
        @JavascriptInterface
        public void saveJpg(final String base64, final String fileName) {
            runOnUiThread(() -> {
                try {
                    byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                    Bitmap bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
                    if (bmp == null) { toast("ছবি তৈরি ব্যর্থ"); return; }
                    Uri uri = saveBitmapToGallery(bmp, fileName);
                    if (uri != null) toast("✅ গ্যালারিতে সেভ হয়েছে!");
                } catch (Exception e) { toast("সেভ ব্যর্থ: " + e.getMessage()); }
            });
        }

        // Share JPG to WhatsApp or WA Business
        @JavascriptInterface
        public void shareWhatsApp(final String base64, final String fileName, final String pkg) {
            runOnUiThread(() -> {
                try {
                    byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                    Bitmap bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
                    if (bmp == null) { toast("ছবি তৈরি ব্যর্থ"); return; }

                    // Save to cache so we can share via FileProvider
                    File f = new File(getCacheDir(), fileName);
                    FileOutputStream fos = new FileOutputStream(f);
                    bmp.compress(Bitmap.CompressFormat.JPEG, 93, fos);
                    fos.flush(); fos.close();

                    Uri imgUri = FileProvider.getUriForFile(
                        MainActivity.this, getPackageName() + ".provider", f);

                    Intent i = new Intent(Intent.ACTION_SEND);
                    i.setType("image/jpeg");
                    i.setPackage(pkg);
                    i.putExtra(Intent.EXTRA_STREAM, imgUri);
                    i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    try {
                        startActivity(i);
                    } catch (Exception ex) {
                        // WA not installed — open generic share
                        i.setPackage(null);
                        startActivity(Intent.createChooser(i, "শেয়ার করুন"));
                    }
                } catch (Exception e) { toast("শেয়ার ব্যর্থ: " + e.getMessage()); }
            });
        }

        // ── Print a base64 image (e.g. an invoice/receipt/slip) through the
        // system print dialog, where the user picks any installed printer
        // app (HP, Canon, Epson, PDF, Bluetooth printer bridge, etc.) ──
        @JavascriptInterface
        public void printImage(final String base64, final String jobName) {
            runOnUiThread(() -> {
                try {
                    byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                    Bitmap bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
                    if (bmp == null) { toast("প্রিন্ট ব্যর্থ: ছবি তৈরি হয়নি"); return; }
                    PrintHelper printHelper = new PrintHelper(MainActivity.this);
                    printHelper.setScaleMode(PrintHelper.SCALE_MODE_FIT);
                    printHelper.printBitmap(
                        (jobName == null || jobName.isEmpty()) ? "Print" : jobName, bmp);
                } catch (Exception e) {
                    toast("প্রিন্ট ব্যর্থ: " + e.getMessage());
                }
            });
        }

        // ── Print whatever is currently on screen inside the web app
        // (a receipt page, invoice, report, etc.) using Android's native
        // Print Manager — opens the same "choose a printer" dialog as any
        // native app, listing every printer app the phone has installed ──
        @JavascriptInterface
        public void printPage(final String jobName) {
            runOnUiThread(() -> {
                try {
                    PrintManager printManager =
                        (PrintManager) getSystemService(Context.PRINT_SERVICE);
                    String name = (jobName == null || jobName.isEmpty())
                        ? (getString(R.string.app_name) + " - Document") : jobName;
                    PrintDocumentAdapter adapter = webView.createPrintDocumentAdapter(name);
                    if (printManager != null) {
                        printManager.print(name, adapter, new PrintAttributes.Builder().build());
                    }
                } catch (Exception e) {
                    toast("প্রিন্ট ব্যর্থ: " + e.getMessage());
                }
            });
        }

        // Called by the local no_internet.html / maintenance.html pages
        @JavascriptInterface
        public void retryLoad() {
            runOnUiThread(MainActivity.this::loadMainApp);
        }

        // Silent background retry — used by no_internet.html's polling timer,
        // does nothing if we're not currently showing that screen
        @JavascriptInterface
        public void checkAndRetry() {
            runOnUiThread(() -> {
                if (currentScreen == ScreenState.NO_INTERNET && isNetworkAvailable()) {
                    loadMainApp();
                }
            });
        }

        @JavascriptInterface
        public void openWifiSettings() {
            runOnUiThread(() -> {
                try {
                    startActivity(new Intent(Settings.ACTION_WIRELESS_SETTINGS));
                } catch (Exception e) {
                    try { startActivity(new Intent(Settings.ACTION_SETTINGS)); } catch (Exception ignored) {}
                }
            });
        }

        // ── Push notifications (Firebase Cloud Messaging) ──
        // See PUSH_NOTIFICATIONS.md for the full protocol.

        // Returns this device's current FCM registration token, or "" if it
        // hasn't arrived yet (it's fetched async at app start — call this
        // again a moment later, or just listen for window.onFcmToken(token)
        // which fires as soon as it's ready).
        @JavascriptInterface
        public String getFcmToken() {
            return MyFirebaseMessagingService.latestToken == null
                    ? "" : MyFirebaseMessagingService.latestToken;
        }

        // Subscribe this device to a custom topic, e.g. "vip_customers" or
        // "branch_dhanmondi", so the backend can push to just that segment
        // in addition to (or instead of) the "all_users" broadcast topic.
        @JavascriptInterface
        public void subscribeToTopic(final String topic) {
            if (topic == null || topic.isEmpty()) return;
            FirebaseMessaging.getInstance().subscribeToTopic(topic);
        }

        @JavascriptInterface
        public void unsubscribeFromTopic(final String topic) {
            if (topic == null || topic.isEmpty()) return;
            FirebaseMessaging.getInstance().unsubscribeFromTopic(topic);
        }
    }

    // Called by MyFirebaseMessagingService.onNewToken(), possibly from a
    // background thread, whenever a fresh FCM token is issued. Pushes it
    // into the page via a JS callback the web app can optionally define.
    static void deliverFcmTokenToWeb(final String token) {
        MainActivity active = instance;
        if (active == null || active.webView == null) return;
        active.runOnUiThread(() -> active.webView.evaluateJavascript(
                "(function(){if(window.onFcmToken){window.onFcmToken("
                        + org.json.JSONObject.quote(token) + ");}})()",
                null));
    }

    // ── Save bitmap to gallery (API 29+) ──
    private Uri saveBitmapToGallery(Bitmap bmp, String fileName) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues cv = new ContentValues();
                cv.put(MediaStore.Images.Media.DISPLAY_NAME, fileName);
                cv.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
                cv.put(MediaStore.Images.Media.IS_PENDING, 1);
                Uri dest = getContentResolver().insert(
                    MediaStore.Images.Media.EXTERNAL_CONTENT_URI, cv);
                if (dest == null) return null;
                try (OutputStream out = getContentResolver().openOutputStream(dest)) {
                    bmp.compress(Bitmap.CompressFormat.JPEG, 93, out);
                }
                cv.clear();
                cv.put(MediaStore.Images.Media.IS_PENDING, 0);
                getContentResolver().update(dest, cv, null, null);
                return dest;
            } else {
                File pics = android.os.Environment.getExternalStoragePublicDirectory(
                    android.os.Environment.DIRECTORY_PICTURES);
                if (!pics.exists()) pics.mkdirs();
                File out = new File(pics, fileName);
                FileOutputStream fos = new FileOutputStream(out);
                bmp.compress(Bitmap.CompressFormat.JPEG, 93, fos);
                fos.flush(); fos.close();
                sendBroadcast(new Intent(Intent.ACTION_MEDIA_SCANNER_SCAN_FILE, Uri.fromFile(out)));
                return Uri.fromFile(out);
            }
        } catch (Exception e) { toast("সেভ ব্যর্থ: " + e.getMessage()); return null; }
    }

    private void toast(String msg) {
        Toast.makeText(this, msg, Toast.LENGTH_LONG).show();
    }

    // ── Location permission helpers ──
    private boolean hasLocationPermission() {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                    == PackageManager.PERMISSION_GRANTED
                || ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION)
                    == PackageManager.PERMISSION_GRANTED;
    }

    private void requestLocationPermission() {
        ActivityCompat.requestPermissions(this,
                new String[]{
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION
                },
                LOCATION_PERMISSION_REQUEST);
    }

    // ── Extra permissions: camera, microphone, notifications, bluetooth,
    // storage — requested up front so future web app features (photo
    // capture, voice input, push notifications, printer pairing, file
    // uploads) work without needing another app update. ──
    private void requestExtraPermissionsIfNeeded() {
        List<String> toRequest = new ArrayList<>();

        addIfMissing(toRequest, Manifest.permission.CAMERA);
        addIfMissing(toRequest, Manifest.permission.RECORD_AUDIO);

        if (Build.VERSION.SDK_INT >= 33) {
            addIfMissing(toRequest, Manifest.permission.POST_NOTIFICATIONS);
            addIfMissing(toRequest, Manifest.permission.READ_MEDIA_IMAGES);
            addIfMissing(toRequest, Manifest.permission.READ_MEDIA_VIDEO);
            addIfMissing(toRequest, Manifest.permission.READ_MEDIA_AUDIO);
        } else if (Build.VERSION.SDK_INT >= 23) {
            addIfMissing(toRequest, Manifest.permission.READ_EXTERNAL_STORAGE);
        }

        if (Build.VERSION.SDK_INT >= 31) {
            addIfMissing(toRequest, Manifest.permission.BLUETOOTH_CONNECT);
            addIfMissing(toRequest, Manifest.permission.BLUETOOTH_SCAN);
        }

        if (!toRequest.isEmpty()) {
            ActivityCompat.requestPermissions(this,
                    toRequest.toArray(new String[0]), EXTRA_PERMISSIONS_REQUEST);
        }
    }

    private void addIfMissing(List<String> list, String permission) {
        if (ContextCompat.checkSelfPermission(this, permission) != PackageManager.PERMISSION_GRANTED) {
            list.add(permission);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);

        if (requestCode == LOCATION_PERMISSION_REQUEST) {
            if (pendingGeoCallback != null) {
                pendingGeoCallback.invoke(pendingGeoOrigin, hasLocationPermission(), false);
                pendingGeoCallback = null;
                pendingGeoOrigin = null;
            }
            // Permission granted — now make sure the device's GPS/location
            // toggle itself is actually switched on.
            if (hasLocationPermission()) ensureGpsIsOn();

        } else if (requestCode == MEDIA_PERMISSION_REQUEST) {
            // Resume a web getUserMedia() (camera/mic) request that was
            // waiting on the OS permission dialog.
            if (pendingWebPermissionRequest != null) {
                grantWebPermissionRequest(pendingWebPermissionRequest);
                pendingWebPermissionRequest = null;
            }
        }
        // EXTRA_PERMISSIONS_REQUEST results need no follow-up: each web
        // feature (camera, mic, notifications, printer) simply checks the
        // permission itself the moment it's actually used.
    }

    // ── Auto-enable device GPS ──────────────────────────────────────
    private void ensureGpsIsOn() {
        try {
            LocationRequest request = new LocationRequest.Builder(
                    Priority.PRIORITY_HIGH_ACCURACY, 10000).build();
            LocationSettingsRequest.Builder builder = new LocationSettingsRequest.Builder()
                    .addLocationRequest(request)
                    .setAlwaysShow(true);

            Task<LocationSettingsResponse> task =
                    LocationServices.getSettingsClient(this).checkLocationSettings(builder.build());

            task.addOnFailureListener(this, e -> {
                if (e instanceof ResolvableApiException) {
                    try {
                        ((ResolvableApiException) e).startResolutionForResult(
                                MainActivity.this, LOCATION_SETTINGS_REQUEST);
                    } catch (IntentSender.SendIntentException ignored) {}
                }
            });
        } catch (Exception ignored) {
            // Play services unavailable on this device — web app's own
            // geolocation prompt/timeout still applies as a fallback.
        }
    }

    // ── Connectivity: is any network currently usable? ──────────────
    private boolean isNetworkAvailable() {
        try {
            if (connectivityManager == null) return true;
            Network network = connectivityManager.getActiveNetwork();
            if (network == null) return false;
            NetworkCapabilities caps = connectivityManager.getNetworkCapabilities(network);
            return caps != null &&
                    (caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET));
        } catch (Exception e) {
            return true; // fail open — let the WebView attempt the load
        }
    }

    // ── Screen switching helpers ──────────────────────────────────────
    private void loadMainApp() {
        if (!isNetworkAvailable()) {
            showNoInternetPage();
            return;
        }
        currentScreen = ScreenState.APP;
        webView.loadUrl(APP_URL);
    }

    private void showNoInternetPage() {
        if (currentScreen == ScreenState.NO_INTERNET) return;
        currentScreen = ScreenState.NO_INTERNET;
        webView.loadUrl(LOCAL_NO_INTERNET);
    }

    private void showMaintenancePage() {
        if (currentScreen == ScreenState.MAINTENANCE) return;
        currentScreen = ScreenState.MAINTENANCE;
        webView.loadUrl(LOCAL_MAINTENANCE);
    }

    private void startConnectivityMonitoring() {
        connectivityManager = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (connectivityManager == null) return;

        networkCallback = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(Network network) {
                runOnUiThread(() -> {
                    if (currentScreen == ScreenState.NO_INTERNET) {
                        loadMainApp();
                    }
                });
            }

            @Override
            public void onLost(Network network) {
                runOnUiThread(() -> {
                    if (!isNetworkAvailable()) {
                        showNoInternetPage();
                    }
                });
            }
        };

        NetworkRequest request = new NetworkRequest.Builder()
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .build();
        connectivityManager.registerNetworkCallback(request, networkCallback);
    }

    // ── Grant a pending web camera/mic request based on current OS perms ──
    private void grantWebPermissionRequest(PermissionRequest request) {
        List<String> granted = new ArrayList<>();
        for (String resource : request.getResources()) {
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)
                    && ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                        == PackageManager.PERMISSION_GRANTED) {
                granted.add(resource);
            } else if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)
                    && ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                        == PackageManager.PERMISSION_GRANTED) {
                granted.add(resource);
            }
        }
        if (!granted.isEmpty()) {
            request.grant(granted.toArray(new String[0]));
        } else {
            request.deny();
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        instance = this;
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_FULLSCREEN,
            WindowManager.LayoutParams.FLAG_FULLSCREEN
        );

        webView = new WebView(this);
        setContentView(webView);

        setUpPushNotifications();

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportMultipleWindows(true);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setGeolocationEnabled(true);

        // Ask for the OS location permission up front so the web app's
        // navigator.geolocation calls can succeed without extra delay.
        if (!hasLocationPermission()) {
            requestLocationPermission();
        } else {
            // Permission already granted from a previous run — just make
            // sure the GPS toggle itself is on too.
            ensureGpsIsOn();
        }

        // Ask for camera / microphone / notifications / bluetooth / storage
        // up front too, so future web app features work immediately.
        requestExtraPermissionsIfNeeded();

        startConnectivityMonitoring();

        // Register bridge — web app calls window.AndroidBridge.saveJpg / shareWhatsApp / printPage ...
        webView.addJavascriptInterface(new AndroidBridge(), "AndroidBridge");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                String url = r.getUrl().toString();
                if (!url.startsWith("http://") && !url.startsWith("https://")) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                    } catch (Exception ignored) {}
                    return true;
                }
                return false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (url != null && url.startsWith(APP_URL)) {
                    currentScreen = ScreenState.APP;
                }
            }

            // Fired when the main page itself fails to load — e.g. the
            // Vercel link/site no longer exists, DNS fails, or the server
            // times out. If we're online but this happens, it's a broken
            // link/deployment, not a connectivity problem, so show the
            // "app under maintenance" screen instead of "no internet".
            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (request == null || !request.isForMainFrame()) return;
                if (currentScreen == ScreenState.NO_INTERNET || currentScreen == ScreenState.MAINTENANCE) return;

                if (!isNetworkAvailable()) {
                    showNoInternetPage();
                } else {
                    showMaintenancePage();
                }
            }

            @Override
            public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
                super.onReceivedHttpError(view, request, errorResponse);
                if (request == null || !request.isForMainFrame()) return;
                if (currentScreen == ScreenState.NO_INTERNET || currentScreen == ScreenState.MAINTENANCE) return;

                int code = errorResponse != null ? errorResponse.getStatusCode() : 0;
                // 4xx/5xx on the main page = the link/deployment is broken
                // or the backend is down — treat as maintenance.
                if (code >= 400) {
                    showMaintenancePage();
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {

            @Override
            public boolean onShowFileChooser(WebView wv, ValueCallback<Uri[]> cb,
                    FileChooserParams p) {
                if (fileChooserCallback != null) fileChooserCallback.onReceiveValue(null);
                fileChooserCallback = cb;
                try {
                    startActivityForResult(p.createIntent(), FILE_CHOOSER_REQUEST);
                } catch (Exception e) {
                    fileChooserCallback = null;
                    return false;
                }
                return true;
            }

            @Override
            public void onGeolocationPermissionsShowPrompt(String origin,
                    GeolocationPermissions.Callback callback) {
                if (hasLocationPermission()) {
                    callback.invoke(origin, true, false);
                } else {
                    // Stash it and finish once the user answers the OS dialog
                    pendingGeoOrigin = origin;
                    pendingGeoCallback = callback;
                    requestLocationPermission();
                }
            }

            // Handles the web app asking for camera/microphone access
            // (e.g. navigator.mediaDevices.getUserMedia for a barcode
            // scanner or voice note feature).
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> {
                    List<String> needed = new ArrayList<>();
                    for (String resource : request.getResources()) {
                        if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)
                                && ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.CAMERA)
                                    != PackageManager.PERMISSION_GRANTED) {
                            needed.add(Manifest.permission.CAMERA);
                        }
                        if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)
                                && ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.RECORD_AUDIO)
                                    != PackageManager.PERMISSION_GRANTED) {
                            needed.add(Manifest.permission.RECORD_AUDIO);
                        }
                    }
                    if (needed.isEmpty()) {
                        grantWebPermissionRequest(request);
                    } else {
                        pendingWebPermissionRequest = request;
                        ActivityCompat.requestPermissions(MainActivity.this,
                                needed.toArray(new String[0]), MEDIA_PERMISSION_REQUEST);
                    }
                });
            }

            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog,
                    boolean isUserGesture, android.os.Message resultMsg) {
                WebView popup = new WebView(MainActivity.this);
                WebSettings ps = popup.getSettings();
                ps.setJavaScriptEnabled(true);
                ps.setDomStorageEnabled(true);
                popup.setWebViewClient(new WebViewClient());
                WebView.WebViewTransport t = (WebView.WebViewTransport) resultMsg.obj;
                t.setWebView(popup);
                resultMsg.sendToTarget();
                return true;
            }
        });

        loadMainApp();
        handleNotificationIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        // App was already running (or in the background) and the user
        // tapped a push notification — jump straight to the linked page.
        handleNotificationIntent(intent);
    }

    // If a push notification carried a "url" (see PUSH_NOTIFICATIONS.md),
    // MyFirebaseMessagingService stashes it on the launch Intent as
    // "notification_url" — open it here instead of the app's normal home URL.
    private void handleNotificationIntent(Intent intent) {
        if (intent == null) return;
        String url = intent.getStringExtra("notification_url");
        if (url == null || url.isEmpty()) return;
        intent.removeExtra("notification_url"); // don't reopen it on rotation etc.
        currentScreen = ScreenState.APP;
        webView.loadUrl(url);
    }

    // ── Push notifications: notification channel + default broadcast topic ──
    private void setUpPushNotifications() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null && nm.getNotificationChannel(getString(R.string.default_notification_channel_id)) == null) {
                NotificationChannel channel = new NotificationChannel(
                        getString(R.string.default_notification_channel_id),
                        getString(R.string.default_notification_channel_name),
                        NotificationManager.IMPORTANCE_HIGH);
                channel.setDescription(getString(R.string.default_notification_channel_desc));
                nm.createNotificationChannel(channel);
            }
        }

        // Every install auto-joins the broadcast topic, so the backend can
        // reach every phone with a single FCM "send to topic" call without
        // ever having to collect/store individual device tokens.
        FirebaseMessaging.getInstance().subscribeToTopic(FCM_BROADCAST_TOPIC);

        // Fetch (or refresh) this device's token and hand it to the web
        // app once the page below finishes loading, in case it wants to
        // register it for per-user targeting later.
        FirebaseMessaging.getInstance().getToken().addOnSuccessListener(token -> {
            MyFirebaseMessagingService.latestToken = token;
            deliverFcmTokenToWeb(token);
        });
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        if (req == FILE_CHOOSER_REQUEST && fileChooserCallback != null) {
            Uri[] results = null;
            if (res == Activity.RESULT_OK && data != null) {
                String str = data.getDataString();
                if (str != null) results = new Uri[]{Uri.parse(str)};
            }
            fileChooserCallback.onReceiveValue(results);
            fileChooserCallback = null;
        }
        // No action needed for LOCATION_SETTINGS_REQUEST — whatever the
        // user chose, checkLocationSettings() will simply re-prompt next
        // time (onResume) if GPS is still off.
    }

    // ── Back button coordination ─────────────────────────────────────
    @Override
    public void onBackPressed() {
        if (currentScreen != ScreenState.APP) {
            // On a fallback screen — back should exit rather than try to
            // ask a page that isn't the real web app.
            super.onBackPressed();
            return;
        }
        webView.evaluateJavascript(
            "(function(){try{return (window.__onAndroidBack && window.__onAndroidBack())?'1':'0';}"
            + "catch(e){return '0';}})()",
            result -> {
                boolean handledByWebApp = "\"1\"".equals(result);
                if (handledByWebApp) return;

                if (webView.canGoBack()) {
                    webView.goBack();
                    return;
                }

                long now = System.currentTimeMillis();
                if (now - lastBackPressAt < 2000) {
                    super.onBackPressed();
                } else {
                    lastBackPressAt = now;
                    Toast.makeText(MainActivity.this,
                        "আরেকবার ব্যাক বাটনে চাপুন অ্যাপ থেকে বের হতে",
                        Toast.LENGTH_SHORT).show();
                }
            }
        );
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
        // Covers the case where the user turned GPS off from Quick
        // Settings while the app was in the background.
        if (hasLocationPermission()) ensureGpsIsOn();
        // Covers coming back from Settings after fixing a connectivity issue.
        if (currentScreen == ScreenState.NO_INTERNET && isNetworkAvailable()) {
            loadMainApp();
        }
    }

    @Override protected void onPause()   { super.onPause();   webView.onPause();   }

    @Override
    protected void onDestroy() {
        if (connectivityManager != null && networkCallback != null) {
            try { connectivityManager.unregisterNetworkCallback(networkCallback); } catch (Exception ignored) {}
        }
        if (instance == this) instance = null;
        webView.destroy();
        super.onDestroy();
    }
}
