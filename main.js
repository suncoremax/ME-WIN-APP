const { app, BrowserWindow, Menu, shell, dialog, ipcMain, session } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const APP_URL = 'https://stock-apk-me.vercel.app/';

let mainWindow = null;
let lastGeoWarningAt = 0;

// ── Back-button coordination ────────────────────────────────────────
// Same idea as the Android wrapper: the hardware/mouse "back" signal
// asks the web app first (window.__onAndroidBack — the exact same
// function the web app already exposes for the Android app), and only
// falls back to WebView-style history if the web app says there's
// nothing left to do. Desktop apps don't "exit" on back, so if there's
// truly nothing to go back to, we simply do nothing — same as any
// normal Windows program.
function triggerBack() {
  if (!mainWindow) return;
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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 360,
    minHeight: 500,
    icon: path.join(__dirname, 'build', 'icon.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // The web app itself calls navigator.geolocation directly —
      // no popup blocking needed for that.
      backgroundThrottling: false
    }
  });

  buildMenu();

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

  // ── Alt+Left / Alt+Right keyboard shortcuts, browser convention ──
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.alt && input.key === 'ArrowLeft') {
      triggerBack();
    } else if (input.alt && input.key === 'ArrowRight') {
      triggerForward();
    }
  });

  // Open non-http(s) / external links (WhatsApp, tel:, etc.) in the
  // system's default handler instead of navigating the app window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!/^https?:\/\//i.test(url) || !url.startsWith(APP_URL.replace(/\/$/, ''))) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(APP_URL.replace(/\/$/, ''))) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.loadURL(APP_URL);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function buildMenu() {
  const template = [
    {
      label: 'অ্যাপ',
      submenu: [
        { label: 'রিফ্রেশ', accelerator: 'CmdOrCtrl+R', click: () => mainWindow && mainWindow.webContents.reload() },
        { type: 'separator' },
        { role: 'quit', label: 'বন্ধ করুন' }
      ]
    },
    {
      label: 'নেভিগেশন',
      submenu: [
        { label: '◀ ব্যাক', accelerator: 'Alt+Left', click: () => triggerBack() },
        { label: 'ফরওয়ার্ড ▶', accelerator: 'Alt+Right', click: () => triggerForward() }
      ]
    },
    {
      label: 'ভিউ',
      submenu: [
        { role: 'resetZoom', label: 'জুম রিসেট' },
        { role: 'zoomIn', label: 'জুম ইন' },
        { role: 'zoomOut', label: 'জুম আউট' },
        { role: 'togglefullscreen', label: 'ফুলস্ক্রিন' },
        { type: 'separator' },
        { role: 'toggleDevTools', label: 'ডেভেলপার টুলস' }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
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

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
