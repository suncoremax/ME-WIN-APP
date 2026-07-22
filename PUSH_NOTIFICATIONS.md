# 🔔 Push Notification Protocol — মিরন ইলেকট্রনিক্স App

This is the spec for your web developer. It explains exactly how your
website/backend sends a notification that shows up on a customer's phone,
even when the app is closed.

The Android app side is already built (this repo). Nothing on the app
needs to change again for this to work — your dev only needs to write
the "send a notification" code on your website/server, using the steps
below.

---

## 1. How it works (big picture)

```
Your website/backend  ──POST──▶  Firebase Cloud Messaging (Google's free push service)  ──▶  Customer's phone
```

- The Android app (already built) automatically registers itself with
  Firebase and joins a broadcast channel called **`all_users`**.
- Your backend never talks to phones directly. It sends **one HTTP
  request to Google's Firebase servers**, telling it "send this message
  to topic `all_users`" (or to one specific device, see §6).
- Firebase delivers it to every phone that has the app installed —
  instantly, even if the app is closed or the phone is locked.
- This is the same system every WhatsApp/Facebook-style "new message"
  notification uses. It's free, with no message limit for this use case.

You do **not** need the user's phone number, and the customer does not
need to "subscribe" to anything — installing the app is enough.

---

## 2. One-time setup (5 minutes, do this once)

1. Go to **https://console.firebase.google.com** → **Add project** →
   name it e.g. `miron-electronics` → skip Google Analytics (optional) → Create.
2. Inside the project: gear icon (⚙) → **Project settings** →
   **Service accounts** tab → **Generate new private key**. This
   downloads a `.json` file. **Keep this file secret** — it's the key
   that lets your server send notifications. Never put it in frontend
   code or a public GitHub repo.
3. Still in Project settings → **General** tab → under "Your apps",
   click **Add app → Android**.
   - Android package name: `com.miron.electronics` (must match exactly)
   - Download the `google-services.json` file it gives you.
4. Give that `google-services.json` file to whoever builds the Android
   APK (or your Anthropic/Claude session) — it goes in the `app/`
   folder of this project, replacing nothing (it's a new file). Rebuild
   the APK once after adding it. This is the only Android-side step;
   everything else in this doc is backend/website work.

That's it — the app is now permanently wired to your Firebase project.
Every future notification just needs step 3 below, no more app updates.

---

## 3. Sending a notification (what your dev actually codes)

Firebase's modern API is called **HTTP v1**. The easiest way to use it
is Google's official Admin SDK, which handles authentication for you.

### Your stack: Supabase + Vercel — recommended setup

Since your backend is **Supabase (database) + Vercel (serverless
functions)**, here's the concrete wiring:

```
Supabase (data + trigger)  ──Database Webhook──▶  Vercel API route  ──▶  Firebase (FCM)  ──▶  Phone
```

**A) One-time: create the Vercel API route that actually sends pushes**

`api/send-push.js` (a normal Vercel serverless function — same repo as
your website, deploys automatically with it):

```javascript
import admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON) // set in
      // Vercel → Project → Settings → Environment Variables. Paste the
      // whole google-services service-account JSON as the value.
    ),
  });
}

export default async function handler(req, res) {
  // Simple shared-secret check so randoms on the internet can't spam
  // your customers — set PUSH_SECRET in Vercel env vars too, and send
  // the same value from Supabase's webhook (step C below).
  if (req.headers["x-push-secret"] !== process.env.PUSH_SECRET) {
    return res.status(401).end();
  }

  const { title, body, url, image, topic = "all_users", token } = req.body;

  const message = {
    data: { title, body, ...(url && { url }), ...(image && { image }) },
    android: { priority: "high" },
    ...(token ? { token } : { topic }), // send to one device OR broadcast
  };

  try {
    await admin.messaging().send(message);
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}
```

Push it to GitHub like any other code change — Vercel deploys it
automatically. Once live, it's reachable at
`https://miron-app.vercel.app/api/send-push`.

**B) Store each phone's FCM token in Supabase (only needed for §6,
per-user targeting — skip this if you're only ever doing broadcast
offers to everyone)**

```sql
create table push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  token text not null unique,
  created_at timestamptz default now()
);
alter table push_tokens enable row level security;
create policy "users manage their own token"
  on push_tokens for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

On the website, when `window.onFcmToken(token)` fires (see §6), upsert
it into this table for the logged-in user via the normal Supabase JS
client.

**C) Trigger a send automatically from a database event**

Supabase → your project → **Database → Webhooks → Create a new hook**:

- Table: whichever one represents the event (e.g. `orders`)
- Events: e.g. `Update` (fires when `status` changes to `shipped`)
- Type: **HTTP Request**
- URL: `https://miron-app.vercel.app/api/send-push`
- Headers: `x-push-secret: <same PUSH_SECRET you set in Vercel>`
- Body: build the JSON your `send-push` route expects, e.g.
  `{"title": "আপনার অর্ডার পাঠানো হয়েছে", "body": "অর্ডার #{{ record.id }} শিপ হয়েছে", "topic": "all_users"}`
  (Supabase webhooks support templating the changed row into the body —
  check the "Payload" section of the webhook editor.)

This means: someone marks an order as shipped in your admin panel →
Supabase fires the webhook → Vercel calls Firebase → customer's phone
buzzes. No manual step.

**For one-off manual broadcasts** (a new offer today, a
maintenance notice), skip the webhook and just call the same
`/api/send-push` endpoint yourself — from a small admin button, a
Supabase Edge Function on a schedule, or even a one-line `curl`:

```bash
curl -X POST https://miron-app.vercel.app/api/send-push \
  -H "Content-Type: application/json" \
  -H "x-push-secret: <PUSH_SECRET>" \
  -d '{"title":"নতুন অফার! 🔥","body":"আজ সব প্রোডাক্টে ২০% ছাড়","url":"https://miron-app.vercel.app/offers"}'
```

### Plain HTTP (any backend language, not just Node)

```
POST https://fcm.googleapis.com/v1/projects/<YOUR_PROJECT_ID>/messages:send
Authorization: Bearer <OAuth2 access token from the service account>
Content-Type: application/json

{
  "message": {
    "topic": "all_users",
    "data": {
      "title": "নতুন অফার! 🔥",
      "body": "আজ সব প্রোডাক্টে ২০% ছাড়",
      "url": "https://miron-app.vercel.app/offers"
    },
    "android": { "priority": "high" }
  }
}
```

(Getting the OAuth2 token from the service-account JSON is the fiddly
part — this is exactly what the `firebase-admin` library above does for
you automatically, which is why it's the recommended route.)

---

## 4. Payload field reference

All fields go inside `"data": { ... }` (plain string key/value pairs —
FCM's "data message" format, which is what the app is built to read):

| Field | Required | Meaning |
|---|---|---|
| `title` | yes | Notification headline |
| `body` | yes | Notification text |
| `url` | no | Full page URL to open when the notification is tapped (see §5). If omitted, tapping just opens the app's normal home page. |
| `image` | no | Full URL of an image to show inside the notification (a promo banner, product photo, etc.) |
| `channel_id` | no | Advanced — only needed if you later want a separate notification category with its own on/off toggle in Android's app settings (e.g. "Order Updates" vs "Offers"). Leave it out to use the default channel. |

---

## 5. Tapping a notification (deep links)

If you include `"url"` in the payload, tapping the notification opens
the app straight to that page (instead of the homepage) — e.g. link
straight to `/offers`, `/order/1234`, or a specific product page.
This works whether the app was closed, in the background, or already open.

---

## 6. Targeting a single user instead of everyone

Sending to the `all_users` topic (§3) is enough for broadcast-style
messages (offers, announcements). If you later want to notify **one
specific customer** (e.g. "your order has shipped"), you need that
customer's individual device token instead of the topic:

1. The app already exposes the phone's own token to your website's
   JavaScript automatically:
   ```javascript
   window.onFcmToken = function(token) {
     // Fires once, shortly after the app opens. Save it against the
     // logged-in customer using the normal Supabase client (upsert into
     // the push_tokens table from §3B):
     supabase.from("push_tokens").upsert({
       user_id: currentUser.id,
       token,
     }, { onConflict: "token" });
   };

   // Or read it on demand (may be "" if it hasn't arrived yet):
   const token = window.AndroidBridge && window.AndroidBridge.getFcmToken
     ? window.AndroidBridge.getFcmToken()
     : null;
   ```
2. To send to that one customer: look up their token from
   `push_tokens` (by `user_id`) and call `/api/send-push` with
   `{"token": "<their token>", "title": ..., "body": ...}` instead of
   `"topic": "all_users"` — the route in §3A already supports both.

Only build this part if/when you actually need per-customer
notifications — for general offers/announcements, the topic approach
in §3 is simpler and needs none of this.

---

## 7. Testing it

Easiest way to test without writing any code first:

1. Firebase Console → your project → **Messaging** (left sidebar) →
   **New campaign** → **Notifications**.
2. Write a title/body → **Send test message**, or target → **Topic**
   → `all_users` → **Publish**.
3. It should appear on any phone with the app installed within a few
   seconds (app can be closed).

---

## 8. Notes

- Works on Android only (this app). No iOS build exists in this repo.
- The customer's phone needs internet (WiFi or mobile data) to receive
  it — same as any push notification on any app.
- On Android 13+, the phone asks the user for a one-time "Allow
  notifications?" permission the first time the app opens — this is
  already handled in the app, nothing extra to build.
- Firebase Cloud Messaging is free with no meaningful volume limit for
  a business of this size.
