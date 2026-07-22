# 📱 মিরন ইলেকট্রনিক্স — Android APK

বিজ্ঞাপনমুক্ত, সম্পূর্ণ বিনামূল্যে Android APK।

> ℹ️ **লোগো:** আপনার দেওয়া নতুন লোগো (Speed বোতল + মিরন ইলেকট্রনিক্স ব্র্যান্ডিং) দিয়ে সব `mipmap-*` icon ও adaptive icon আপডেট করা হয়েছে। নতুন করে কিছু করার দরকার নেই — সরাসরি বিল্ড দিলেই নতুন আইকন দেখা যাবে। শুধু আইকন বদলানো হয়েছে, বাকি সব (URL, no-internet/maintenance screen, ইত্যাদি) আগের মতোই আছে।

> 🔔 **Push Notifications:** ওয়েব অ্যাপ থেকে ফোনে নোটিফিকেশন পাঠানোর সম্পূর্ণ protocol/spec **[PUSH_NOTIFICATIONS.md](./PUSH_NOTIFICATIONS.md)** ফাইলে লেখা আছে — এটা আপনার web dev কে দিন। App-side কোড (Firebase Cloud Messaging) ইতিমধ্যে বসানো হয়েছে; শুধু একটা `google-services.json` ফাইল লাগবে (doc-এর ধাপ ২ দেখুন), তারপর normal build দিলেই কাজ করবে।

---

## ⚡ সবচেয়ে সহজ পদ্ধতি — GitHub দিয়ে Auto Build

### ধাপ ১ — URL বসান

`app/src/main/java/com/miron/electronics/MainActivity.java` ফাইল খুলুন।

এই লাইনটি খুঁজুন:
```java
private static final String APP_URL = "https://YOUR-APP.vercel.app";
```

আপনার Vercel URL দিন:
```java
private static final String APP_URL = "https://miron-app.vercel.app";
```

### ধাপ ২ — GitHub Repository তৈরি করুন

1. **github.com** → New Repository → নাম দিন: `miron-android`
2. **Public** রাখুন (Private হলে Actions কাজ করবে)

### ধাপ ৩ — Code Upload করুন

```bash
cd miron-android
git init
git add .
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/আপনার-username/miron-android.git
git push -u origin main
```

### ধাপ ৪ — APK Download করুন

GitHub push করার **৫-৭ মিনিট** পর:

```
আপনার Repository → Actions tab → সবচেয়ে নতুন workflow
→ "MironElectronics-APK" artifact → Download
```

অথবা **Releases** section থেকেও পাবেন।

---

## 📲 APK Install করুন

1. ZIP extract করুন → `MironElectronics.apk` পাবেন
2. Phone এ পাঠান (WhatsApp / USB / Google Drive)
3. Phone Settings → **"Unknown sources"** বা **"Install unknown apps"** চালু করুন
4. APK তে tap করুন → Install

---

## 🔄 App Update করতে

শুধু code change করে GitHub এ push করুন:
```bash
git add .
git commit -m "update"
git push
```
**৫-৭ মিনিটে নতুন APK তৈরি হবে।**

---

## ✨ Features

- ✅ কোনো বিজ্ঞাপন নেই
- ✅ Pull-to-refresh (নিচে টানলে reload)
- ✅ Back button কাজ করে
- ✅ নতুন লোগো (আপলোড করা ছবি থেকে) — সব density + adaptive icon সহ
- ✅ Internet না থাকলে বাংলা গ্রাফিক্স সহ "ইন্টারনেট সংযোগ নেই" স্ক্রিন, auto-retry + সরাসরি WiFi Settings বাটন
- ✅ লিংক/সার্ভার কাজ না করলে (ভুল লিংক, deployment মুছে গেলে, সার্ভার ডাউন) আলাদা "অ্যাপটি রক্ষণাবেক্ষণে আছে" স্ক্রিন
- ✅ Retry button (উভয় স্ক্রিনে)
- ✅ Full screen (action bar নেই)
- ✅ নতুন Permissions: Camera, Microphone, Notifications, Bluetooth, Storage — future আপডেটের জন্য প্রস্তুত (web app চাইলেই ব্যবহার করতে পারবে, নতুন APK লাগবে না)
- ✅ Print সাপোর্ট — web app থেকে JS call করলে ফোনের নিজস্ব Print App (যেকোনো প্রিন্টার: HP/Canon/Epson/PDF/Bluetooth printer) খুলে যাবে

---

## 🖨️ Print কীভাবে ব্যবহার করবেন (ওয়েব অ্যাপ থেকে)

আপনার ওয়েব অ্যাপে "Print" বাটনে ক্লিক করলে এই JS কল করুন:

```javascript
// পুরো পেজ/রিসিট প্রিন্ট করতে (যা স্ক্রিনে আছে)
window.AndroidBridge.printPage("Invoice #1234");

// শুধু একটা ছবি (base64 JPG/PNG, data: prefix ছাড়া) প্রিন্ট করতে
window.AndroidBridge.printImage(base64String, "Slip");
```

দুটোই ফোনে ইনস্টল করা প্রিন্টার অ্যাপের native "Choose a printer" ডায়ালগ খুলে দেবে।

## 🌐 No-Internet / Maintenance স্ক্রিন

- ফোনে ইন্টারনেট না থাকলে → বাংলা "ইন্টারনেট সংযোগ নেই" স্ক্রিন, স্বয়ংক্রিয়ভাবে সংযোগ ফিরলে reload হয়ে যাবে।
- ইন্টারনেট আছে কিন্তু `APP_URL` লিংক কাজ করছে না (ভুল লিংক / deployment ডিলিট / সার্ভার ৪xx-৫xx error) → "অ্যাপটি রক্ষণাবেক্ষণে আছে" স্ক্রিন।
- দুটো পেজই `app/src/main/assets/no_internet.html` ও `maintenance.html` এ আছে — চাইলে টেক্সট/রং/লোগো এখান থেকেই বদলাতে পারবেন।

---

## 📁 Project Structure

```
miron-android/
├── .github/workflows/build.yml  ← Auto APK builder
├── app/src/main/
│   ├── java/com/miron/electronics/
│   │   └── MainActivity.java    ← 👈 URL এখানে বদলান
│   ├── res/
│   │   ├── mipmap-*/            ← App icons
│   │   └── values/strings.xml  ← App name
│   └── AndroidManifest.xml
├── build.gradle
├── settings.gradle
└── gradlew
```
