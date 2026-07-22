const { app, BrowserWindow, shell, dialog, ipcMain, session, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const url = require('url');

const APP_URL = 'https://stock-apk-me.vercel.app/';
const LOCAL_NO_INTERNET = url.pathToFileURL(path.join(__dirname, 'assets', 'no_internet.html')).toString();
const LOCAL_MAINTENANCE = url.pathToFileURL(path.join(__dirname, 'assets', 'maintenance.html')).toString();

let mainWindow = null;
let lastGeoWarningAt = 0;

// Same three-state screen tracking as the Android WebView wrapper, so
// the desktop app degrades exactly the same way when the site can't be
// reached: APP (normal), NO_INTERNET (no network), MAINTENANCE (network
// is fine but the site/deployment itself is down or erroring).
const ScreenState = { APP: 'APP', NO_INTERNET: 'NO_INTERNET', MAINTENANCE: 'MAINTENANCE' };
let currentScreen = ScreenState.APP;

// ── Back/forward coordination ───────────────────────────────────────
// Same idea as the Android wrapper: the back/forward signal asks the
// web app first (window.__onAndroidBack — the exact same function the
// web app already exposes for the Android app), and only falls back to
// browser-style history if the web app says there's nothing left to do.
function triggerBack() {
  if (!mainWindow || currentScreen !== ScreenState.APP) return;
  mainWindow.webContents
    .executeJavaScript(
      "(function(){try{return (window.__onAndroidBack && window.__onAndroidBack())?'1':'0';}" +
        "catch(e){return '0';}})()"
    )
    .then((result) => {
      if (result === '1') return;
      if (mainWindow.webContents.canGoBack()) {
        mainWindow.webContents.goBack();
      }
    })
    .catch(() => {});
}

function triggerForward() {
  if (!mainWindow) return;
  if (mainWindow.webContents.canGoForward()) {
    mainWindow.webContents.goForward();
  }
}

function isNetworkAvailable() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (!iface.internal && (iface.family === 'IPv4' || iface.family === 'IPv6')) {
        return true;
      }
    }
  }
  return false;
}

function loadMainApp() {
  if (!mainWindow) return;
  currentScreen = ScreenState.APP;
  mainWindow.loadURL(APP_URL);
}

function showNoInternetPage() {
  if (!mainWindow || currentScreen === ScreenState.NO_INTERNET) return;
  currentScreen = ScreenState.NO_INTERNET;
  mainWindow.loadURL(LOCAL_NO_INTERNET);
}

function showMaintenancePage() {
  if (!mainWindow || currentScreen === ScreenState.MAINTENANCE) return;
  currentScreen = ScreenState.MAINTENANCE;
  mainWindow.loadURL(LOCAL_MAINTENANCE);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 360,
    minHeight: 500,
    icon: path.join(__dirname, 'build', 'icon.ico'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      // The web app itself calls navigator.geolocation directly —
      // no popup blocking needed for that.
      backgroundThrottling: false
    }
  });

  // ── No native menu bar ──────────────────────────────────────────
  // The Android app is a borderless, full-screen WebView with no menu
  // at all. A hidden/auto-hide Windows menu bar reveals itself on a
  // bare Alt press and can also claim Alt+<letter> mnemonics from the
  // menu labels — both of which can eat the very first keystroke of
  // whatever the person is typing (this matters a lot for POS-style
  // typing and keyboard-wedge barcode scanners). Removing the menu
  // entirely avoids that interference. Every action it used to hold is
  // still available as a plain keyboard shortcut below.
  Menu.setApplicationMenu(null);

  // ── Auto-allow geolocation so the web app's location features work
  //    without an extra permission popup — mirrors the Android wrapper
  //    requesting the OS permission up front. ──
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => {
    if (permission === 'geolocation' || permission === 'notifications') {
      callback(true);
    } else {
      callback(false);
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // Make sure the page — and therefore the keyboard — is focused
    // immediately, with no extra click needed to start typing.
    mainWindow.focus();
    mainWindow.webContents.focus();
  });

  mainWindow.on('focus', () => {
    mainWindow.webContents.focus();
  });

  // ── Windows mouse "Back"/"Forward" side buttons send app-command ──
  mainWindow.on('app-command', (e, cmd) => {
    if (cmd === 'browser-backward') {
      e.preventDefault();
      triggerBack();
    } else if (cmd === 'browser-forward') {
      e.preventDefault();
      triggerForward();
    }
  });

  // ── Keyboard shortcuts (replace the removed menu bar) ──
  // These only act on specific combinations; every other keystroke
  // (typing, barcode-scanner input, IME composition) passes straight
  // through to the page untouched.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;

    if (input.alt && input.key === 'ArrowLeft') {
      triggerBack();
    } else if (input.alt && input.key === 'ArrowRight') {
      triggerForward();
    } else if (input.control && !input.shift && (input.key === 'r' || input.key === 'R')) {
      if (currentScreen === ScreenState.APP) mainWindow.webContents.reload();
      else loadMainApp();
    } else if (input.key === 'F5') {
      if (currentScreen === ScreenState.APP) mainWindow.webContents.reload();
      else loadMainApp();
    } else if (input.control && !input.shift && (input.key === 'p' || input.key === 'P')) {
      event.preventDefault();
      printCurrentPage(null);
    } else if (input.key === 'F11') {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
    } else if (input.control && (input.key === '0')) {
      mainWindow.webContents.setZoomLevel(0);
    } else if (input.control && (input.key === '=' || input.key === '+')) {
      mainWindow.webContents.setZoomLevel(mainWindow.webContents.getZoomLevel() + 0.5);
    } else if (input.control && (input.key === '-')) {
      mainWindow.webContents.setZoomLevel(mainWindow.webContents.getZoomLevel() - 0.5);
    } else if (input.control && input.shift && (input.key === 'i' || input.key === 'I')) {
      mainWindow.webContents.toggleDevTools();
    }
  });

  // Open non-http(s) / external links (WhatsApp, tel:, etc.) in the
  // system's default handler instead of navigating the app window.
  mainWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    if (!/^https?:\/\//i.test(targetUrl) || !targetUrl.startsWith(APP_URL.replace(/\/$/, ''))) {
      shell.openExternal(targetUrl);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    if (!targetUrl.startsWith(APP_URL.replace(/\/$/, ''))) {
      event.preventDefault();
      shell.openExternal(targetUrl);
    }
  });

  // ── Same fallback-screen logic as the Android WebView wrapper ──
  mainWindow.webContents.on('did-finish-load', () => {
    const current = mainWindow.webContents.getURL();
    if (current && current.startsWith(APP_URL)) {
      currentScreen = ScreenState.APP;
    }
  });

  // Fired when the main page itself fails to load — e.g. the Vercel
  // link/site no longer exists, DNS fails, or the request times out.
  // If we're online but this happens, it's a broken link/deployment,
  // not a connectivity problem, so show "under maintenance" instead of
  // "no internet" — exactly mirroring MainActivity.onReceivedError().
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return;
    if (errorCode === -3) return; // ERR_ABORTED — usually just a cancelled/redirected navigation
    if (currentScreen === ScreenState.NO_INTERNET || currentScreen === ScreenState.MAINTENANCE) return;

    if (!isNetworkAvailable()) {
      showNoInternetPage();
    } else {
      showMaintenancePage();
    }
  });

  // 4xx/5xx on the main page = the link/deployment is broken or the
  // backend is down — treat as maintenance, same as the Android app.
  mainWindow.webContents.on('did-navigate', (event, navUrl, httpResponseCode) => {
    if (!navUrl || !navUrl.startsWith(APP_URL.replace(/\/$/, ''))) return;
    if (currentScreen === ScreenState.NO_INTERNET || currentScreen === ScreenState.MAINTENANCE) return;
    if (httpResponseCode >= 400) {
      showMaintenancePage();
    }
  });

  loadMainApp();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ── Geolocation unavailable (Windows Location Services likely off) ──
// The closest a desktop app can get to Android's "auto-enable GPS"
// dialog: Windows doesn't let any app flip that system toggle either,
// so instead we detect the failure (reported by preload.js) and offer
// a one-click shortcut straight to the right Settings page.
ipcMain.on('geo-unavailable', () => {
  const now = Date.now();
  if (now - lastGeoWarningAt < 60000) return; // don't spam repeated watchPosition retries
  lastGeoWarningAt = now;

  if (!mainWindow) return;
  dialog
    .showMessageBox(mainWindow, {
      type: 'warning',
      buttons: ['লোকেশন সেটিংস খুলুন', 'বাতিল'],
      defaultId: 0,
      cancelId: 1,
      title: 'লোকেশন বন্ধ আছে',
      message: 'এই কম্পিউটারে Location সার্ভিস বন্ধ আছে।',
      detail: 'পাঞ্চ/লোকেশন ফিচার ব্যবহার করতে Windows Settings থেকে Location চালু করুন।'
    })
    .then((res) => {
      if (res.response === 0) {
        shell.openExternal('ms-settings:privacy-location');
      }
    });
});

// ── Save image (mirrors Android AndroidBridge.saveJpg) ──
ipcMain.on('save-jpg', (event, base64, fileName) => {
  if (!mainWindow) return;
  dialog
    .showSaveDialog(mainWindow, {
      title: 'ছবি সেভ করুন',
      defaultPath: path.join(app.getPath('pictures'), fileName || 'slip.jpg'),
      filters: [{ name: 'JPEG Image', extensions: ['jpg', 'jpeg'] }]
    })
    .then((result) => {
      if (result.canceled || !result.filePath) return;
      const buffer = Buffer.from(base64, 'base64');
      fs.writeFile(result.filePath, buffer, (err) => {
        if (err) {
          dialog.showErrorBox('সেভ ব্যর্থ', String(err.message || err));
        } else {
          dialog.showMessageBox(mainWindow, {
            type: 'info',
            message: '✅ ছবি সেভ হয়েছে!',
            detail: result.filePath
          });
        }
      });
    });
});

// ── "Share to WhatsApp" (mirrors Android AndroidBridge.shareWhatsApp) ──
// Windows has no universal app-to-app share sheet the way Android does,
// so the closest honest equivalent is: save the image to a temp/known
// location, then open WhatsApp (desktop app if installed, else
// WhatsApp Web) so the user can attach it in one extra step.
ipcMain.on('share-whatsapp', (event, base64, fileName) => {
  if (!mainWindow) return;
  const tempDir = path.join(os.tmpdir(), 'miron-electronics-shares');
  try {
    fs.mkdirSync(tempDir, { recursive: true });
  } catch (e) {}
  const filePath = path.join(tempDir, fileName || `slip-${Date.now()}.jpg`);
  const buffer = Buffer.from(base64, 'base64');
  fs.writeFile(filePath, buffer, (err) => {
    if (err) {
      dialog.showErrorBox('শেয়ার ব্যর্থ', String(err.message || err));
      return;
    }
    shell.showItemInFolder(filePath);
    dialog
      .showMessageBox(mainWindow, {
        type: 'info',
        buttons: ['WhatsApp খুলুন', 'ঠিক আছে'],
        defaultId: 0,
        title: 'ছবি প্রস্তুত',
        message: '✅ ছবিটি সেভ হয়েছে — WhatsApp এ এটি অ্যাটাচ করুন।',
        detail: filePath
      })
      .then((res) => {
        if (res.response === 0) {
          shell.openExternal('https://web.whatsapp.com/');
        }
      });
  });
});

// ── Print whatever is currently on screen (a receipt/invoice/report)
// using the native Windows print dialog — same idea as the Android
// app's PrintManager.print(), letting the user pick any installed
// printer (including PDF / Bluetooth receipt printers). ──
function printCurrentPage(jobName) {
  if (!mainWindow) return;
  mainWindow.webContents.print(
    { silent: false, printBackground: true, deviceName: '' },
    (success, errorType) => {
      if (!success && errorType && errorType !== 'cancelled') {
        dialog.showErrorBox('প্রিন্ট ব্যর্থ', String(errorType));
      }
    }
  );
}
ipcMain.on('print-page', (event, jobName) => printCurrentPage(jobName));

// ── Print a base64 image (e.g. an invoice/receipt/slip) — opens a
// hidden window with just that image and sends it to the native print
// dialog, mirroring Android's AndroidBridge.printImage(). ──
ipcMain.on('print-image', (event, base64, jobName) => {
  if (!mainWindow) return;
  const printWin = new BrowserWindow({
    show: false,
    parent: mainWindow,
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  });

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    * { margin:0; padding:0; }
    html, body { width:100%; }
    img { display:block; width:100%; height:auto; }
  </style></head><body><img src="data:image/jpeg;base64,${base64}"></body></html>`;

  printWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  printWin.webContents.on('did-finish-load', () => {
    printWin.webContents.print(
      { silent: false, printBackground: true },
      (success, errorType) => {
        if (!success && errorType && errorType !== 'cancelled') {
          dialog.showErrorBox('প্রিন্ট ব্যর্থ', String(errorType));
        }
        printWin.close();
      }
    );
  });
});

// ── Called by the local no_internet.html / maintenance.html pages ──
ipcMain.on('retry-load', () => loadMainApp());
ipcMain.on('check-and-retry', () => {
  if (currentScreen === ScreenState.NO_INTERNET && isNetworkAvailable()) {
    loadMainApp();
  }
});
ipcMain.on('open-wifi-settings', () => {
  shell.openExternal('ms-settings:network').catch(() => {
    shell.openExternal('ms-settings:').catch(() => {});
  });
});

// ── Push-notification-shaped stubs ──
// Desktop has no FCM token; these exist purely so the web app's calls
// to window.AndroidBridge.getFcmToken() / subscribeToTopic() never throw.
ipcMain.handle('get-fcm-token', () => '');
ipcMain.on('subscribe-topic', () => {});
ipcMain.on('unsubscribe-topic', () => {});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
