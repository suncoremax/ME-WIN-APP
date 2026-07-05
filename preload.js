const { contextBridge, ipcRenderer } = require('electron');

// ── Same bridge name/methods the Android WebView wrapper exposes.
// The web app already checks `window.AndroidBridge` for its save/share
// buttons, so exposing the identical interface here means the web app
// (index.html) needs zero changes to work on Windows too. ──
contextBridge.exposeInMainWorld('AndroidBridge', {
  saveJpg: (base64, fileName) => ipcRenderer.send('save-jpg', base64, fileName),
  shareWhatsApp: (base64, fileName, pkg) => ipcRenderer.send('share-whatsapp', base64, fileName)
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
