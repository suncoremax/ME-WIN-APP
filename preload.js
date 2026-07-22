const { contextBridge, ipcRenderer } = require('electron');

// ── Same bridge name/methods the Android WebView wrapper exposes
// (window.AndroidBridge). The web app already calls these for its
// save / share / print buttons, so exposing the identical interface
// here means the web app needs zero changes to work on Windows too. ──
contextBridge.exposeInMainWorld('AndroidBridge', {
  // Save a base64 JPEG (e.g. an invoice/slip) — shows a native "Save As" dialog
  saveJpg: (base64, fileName) => ipcRenderer.send('save-jpg', base64, fileName),

  // Share a base64 JPEG to WhatsApp (closest desktop equivalent: save + open WhatsApp)
  shareWhatsApp: (base64, fileName, pkg) => ipcRenderer.send('share-whatsapp', base64, fileName),

  // Print a base64 image (receipt/slip/invoice) through the native Windows print dialog
  printImage: (base64, jobName) => ipcRenderer.send('print-image', base64, jobName),

  // Print whatever is currently on screen in the web app through the native print dialog
  printPage: (jobName) => ipcRenderer.send('print-page', jobName),

  // Called by the local no_internet.html / maintenance.html fallback pages
  retryLoad: () => ipcRenderer.send('retry-load'),
  checkAndRetry: () => ipcRenderer.send('check-and-retry'),
  openWifiSettings: () => ipcRenderer.send('open-wifi-settings'),

  // Push-notification-shaped stubs so the web app never throws when it
  // calls these (desktop has no FCM token — these are safe no-ops).
  getFcmToken: () => ipcRenderer.invoke('get-fcm-token'),
  subscribeToTopic: (topic) => ipcRenderer.send('subscribe-topic', topic),
  unsubscribeFromTopic: (topic) => ipcRenderer.send('unsubscribe-topic', topic)
});

// ── Detect "location services are off" the moment the web app's own
// navigator.geolocation calls fail, and tell the main process so it
// can offer a one-click shortcut to Windows' Location settings — the
// closest a desktop app can get to Android's "auto-enable GPS" dialog
// (no app, on any platform, is allowed to silently flip that system
// toggle itself). ──
window.addEventListener('DOMContentLoaded', () => {
  if (!navigator.geolocation) return;

  const origGetCurrentPosition = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
  const origWatchPosition = navigator.geolocation.watchPosition.bind(navigator.geolocation);

  function wrapError(userErrorCb) {
    return function (err) {
      // 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE (typically means
      // Windows Location Services is turned off at the OS level)
      if (err && (err.code === 1 || err.code === 2)) {
        ipcRenderer.send('geo-unavailable');
      }
      if (typeof userErrorCb === 'function') userErrorCb(err);
    };
  }

  navigator.geolocation.getCurrentPosition = function (successCb, errorCb, opts) {
    return origGetCurrentPosition(successCb, wrapError(errorCb), opts);
  };
  navigator.geolocation.watchPosition = function (successCb, errorCb, opts) {
    return origWatchPosition(successCb, wrapError(errorCb), opts);
  };
});

// ── Keyboard input reliability ───────────────────────────────────────
// Physical keyboards, barcode-scanner "keyboard wedges", and IME (Bengali
// input) all depend on the focused element actually receiving key events.
// If the page loads with nothing focused (common right after navigation)
// the very first keystrokes can be silently lost. As soon as the DOM is
// ready, make sure a natural text target has focus, and re-focus the
// window itself so typing works immediately without an extra click.
window.addEventListener('DOMContentLoaded', () => {
  const focusSomething = () => {
    const active = document.activeElement;
    const isEditable = (el) =>
      el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);

    if (isEditable(active)) return;

    // Prefer the first visible, enabled input/textarea already on the page
    const candidate = document.querySelector(
      'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), [contenteditable="true"]'
    );
    if (candidate) {
      candidate.focus({ preventScroll: true });
    } else {
      // No input yet — at least make sure the document/body can receive
      // key events so shortcuts and scanner input aren't swallowed.
      document.body && document.body.setAttribute('tabindex', '-1');
      document.body && document.body.focus({ preventScroll: true });
    }
  };
  focusSomething();
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) focusSomething();
  });
});
