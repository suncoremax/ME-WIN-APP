# 🖥️ মিরন ইলেকট্রনিক্স — Windows App

বিজ্ঞাপনমুক্ত Windows Desktop App (Setup.exe), Android APK-এর মতোই একই web app কে wrap করে।

---

## ⚡ সবচেয়ে সহজ পদ্ধতি — GitHub দিয়ে Auto Build

### ধাপ ১ — URL বসান

`main.js` ফাইল খুলুন। এই লাইনটি খুঁজুন:
```js
const APP_URL = 'https://stock-apk-me.vercel.app/';
```
আপনার Vercel URL দিয়ে বদলে দিন।

### ধাপ ২ — GitHub Repository তৈরি করুন

1. **github.com** → New Repository → নাম দিন: `miron-windows`
2. **Public** রাখুন (Private হলে Actions কাজ করবে না — বা নিজের runner minutes লাগবে)

### ধাপ ৩ — Code Upload করুন

```bash
cd miron-windows
git init
git add .
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/আপনার-username/miron-windows.git
git push -u origin main
```

### ধাপ ৪ — Setup.exe Download করুন

GitHub push করার **৫-১০ মিনিট** পর:

```
আপনার Repository → Actions tab → সবচেয়ে নতুন workflow
→ "MironElectronics-Setup" artifact → Download
```

ZIP এর ভেতরে `Miron Electronics Setup <version>.exe` পাবেন।

---

## 💻 লোকাল কম্পিউটারে নিজে Build করতে চাইলে

```bash
npm install
npm run dist
```
`dist/` ফোল্ডারে Setup.exe তৈরি হবে। (Node.js 18+ লাগবে, Windows-এই build করতে হবে।)

চালিয়ে দেখতে চাইলে (build ছাড়াই):
```bash
npm install
npm start
```

---

## 💿 Install করুন

1. `Miron Electronics Setup.exe` ডাবল ক্লিক করুন
2. ইনস্টল লোকেশন বেছে নিন (চাইলে ডিফল্ট রাখুন) → Install
3. Start Menu ও Desktop-এ শর্টকাট তৈরি হবে

---

## ✨ Features (Android APK-এর সমতুল্য)

- ✅ কোনো বিজ্ঞাপন নেই। App icon এখন Android APK-এর মতোই একই লোগো (`build/icon.ico`, `assets/logo.png`)।
- ✅ কোনো মেনু বার নেই — ঠিক Android WebView-এর মতোই পুরো window জুড়ে শুধু app। (এতে Alt-key মেনু
  mnemonic কীবোর্ডের প্রথম কী-প্রেস "খেয়ে ফেলার" সমস্যাও চলে যায় — নিচে দেখুন।)
- ✅ **কীবোর্ড ইনপুট সরাসরি কাজ করে** — লোড হওয়ার সাথে সাথেই window/page ফোকাস করা হয় (আলাদা করে ক্লিক
  করা লাগবে না), এবং মেনু বার সরিয়ে দেওয়ায় Alt চাপলে আর কিছু "hidden menu" popup হয়ে টাইপিং/ব্যারকোড
  স্ক্যানার ইনপুট নষ্ট করে না। প্রয়োজনীয় শর্টকাটগুলো এখন সরাসরি কীবোর্ড দিয়েই পাওয়া যায়:
  - `Ctrl+R` / `F5` → রিফ্রেশ
  - `Alt+←` / `Alt+→` → Back / Forward
  - `Ctrl+P` → প্রিন্ট
  - `F11` → ফুলস্ক্রিন
  - `Ctrl+ +/-/0` → জুম ইন/আউট/রিসেট
  - `Ctrl+Shift+I` → Developer Tools
- ✅ **প্রিন্ট সাপোর্ট** (নতুন, Android APK-এর `printPage` / `printImage`-এর সমতুল্য) —
  `window.AndroidBridge.printPage()` কল করলে বর্তমান পেজ (রিসিট/ইনভয়েস/রিপোর্ট) নেটিভ Windows Print
  ডায়ালগে চলে যায়, আর `printImage(base64, jobName)` কল করলে শুধু সেই ছবিটা প্রিন্ট হয় — ঠিক Android-এর
  মতোই যেকোনো ইনস্টলড প্রিন্টার (PDF, USB/Bluetooth receipt printer ইত্যাদি) বেছে নেওয়া যায়।
- ✅ Back বাটন কাজ করে — Alt+Left, mouse এর side/back বাটন।
  APK-এর মতোই আগে ওয়েব অ্যাপকে জিজ্ঞেস করা হয় (কোনো modal/ট্যাব বন্ধ করা দরকার কিনা), তারপর ব্রাউজার history, তারপর কিছুই না।
- ✅ **No-internet / Maintenance fallback screens** (নতুন — Android APK-এর `no_internet.html` /
  `maintenance.html` থেকে হুবহু আনা হয়েছে, একই লোগো ও ডিজাইন সহ)। ইন্টারনেট না থাকলে "ইন্টারনেট সংযোগ নেই"
  পেজ দেখায় (রিট্রাই + সেটিংস বাটনসহ, প্রতি ৫ সেকেন্ডে অটো-রিট্রাই), আর সার্ভার/লিংক ডাউন থাকলে "রক্ষণাবেক্ষণ"
  পেজ দেখায়।
- ✅ Location: geolocation permission auto-allow করা হয়। Windows-এর নিজস্ব Location সার্ভিস বন্ধ থাকলে
  সরাসরি "লোকেশন সেটিংস খুলুন" বাটনসহ একটি নোটিফিকেশন দেখানো হয় (Windows-এ কোনো অ্যাপই সরাসরি GPS/Location
  toggle অন করে দিতে পারে না — এক ক্লিকে সঠিক সেটিংস পেজে নিয়ে যাওয়াটাই সর্বোচ্চ সম্ভব)।
- ✅ ছবি সেভ / WhatsApp শেয়ার — Android-এর `AndroidBridge.saveJpg` / `shareWhatsApp` এর ঠিক একই ইন্টারফেস
  Windows-এও এক্সপোজ করা হয়েছে (`window.AndroidBridge`), তাই **index.html-এ কোনো পরিবর্তন লাগেনি**।
  - Save → নেটিভ "Save As" ডায়ালগ
  - Share to WhatsApp → ছবি সেভ করে WhatsApp Web/Desktop খুলে দেয় (Windows-এ Android-এর মতো সরাসরি
    app-to-app share sheet নেই, তাই এক ধাপ বেশি লাগবে — ছবি অ্যাটাচ করা)
- ✅ External link (tel:, WhatsApp deep link ইত্যাদি) সিস্টেমের ডিফল্ট অ্যাপে খোলে, app window-এ নয়
- ✅ `getFcmToken` / `subscribeToTopic` / `unsubscribeFromTopic` — desktop-এ push notification (FCM)
  সম্ভব নয় বলে এগুলো নিরাপদ no-op/স্টাব হিসেবে রাখা আছে, যাতে web app-এর কোনো কল ভেঙে না পড়ে।

> ℹ️ `window.AndroidBridge` নামটা Android থেকে এসেছে বলে অক্ষতই রাখা হয়েছে — এতে **একই web app কোনো
> পরিবর্তন ছাড়াই** Android APK এবং Windows app দুটোতেই কাজ করবে।

---

## 🔄 App Update করতে

শুধু code change করে GitHub এ push করুন:
```bash
git add .
git commit -m "update"
git push
```
**৫-১০ মিনিটে নতুন Setup.exe তৈরি হবে।**

---

## 📁 Project Structure

```
miron-windows/
├── .github/workflows/build.yml   ← Auto Setup.exe builder
├── main.js                       ← 👈 URL এখানে বদলান, back/forward, print, fallback-screen, keyboard logic
├── preload.js                    ← window.AndroidBridge bridge + geolocation failure detection + auto-focus
├── package.json                  ← electron-builder config (NSIS installer)
├── build/
│   ├── icon.ico                  ← App icon (same logo as the Android APK)
│   └── icon.png                  ← Same logo, PNG (spare copy)
└── assets/
    ├── logo.png                  ← App logo, used inside the fallback pages below
    ├── no_internet.html          ← Shown when there's no internet (ported from the Android app)
    └── maintenance.html          ← Shown when the site/server itself is down (ported from the Android app)
```
