require("dotenv").config();

const express = require("express");
const cors    = require("cors");

const app  = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

// ── In-memory store ───────────────────────────────────────────────────────────
const db = { reports: [], sosAlerts: [] };

// ── Optional: Firebase Admin (for real FCM) ───────────────────────────────────
let firebaseAdmin = null;
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const admin = require("firebase-admin");
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: process.env.FIREBASE_DATABASE_URL,
      });
    }
    firebaseAdmin = admin;
    console.log("✅ Firebase Admin SDK initialized");
  }
} catch (e) {
  console.warn("⚠️  Firebase Admin not configured — FCM push disabled:", e.message);
}

// ── Optional: Twilio (for server-side SMS) ────────────────────────────────────
let twilioClient = null;
try {
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    const twilio = require("twilio");
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    console.log("✅ Twilio initialized");
  }
} catch (e) {
  console.warn("⚠️  Twilio not configured — server-side SMS disabled");
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const sendFCMPush = async (token, title, body, data = {}) => {
  if (!firebaseAdmin || !token) return false;
  try {
    await firebaseAdmin.messaging().send({
      token,
      notification: { title, body },
      data,
      android: { priority: "high", notification: { sound: "default", channelId: "emergency" } },
      apns:    { payload: { aps: { sound: "default", badge: 1 } } },
    });
    return true;
  } catch (e) {
    console.warn("FCM send failed:", e.message);
    return false;
  }
};

const sendTwilioSMS = async (to, message) => {
  if (!twilioClient || !process.env.TWILIO_PHONE_NUMBER) return false;
  try {
    await twilioClient.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to,
    });
    return true;
  } catch (e) {
    console.warn("Twilio SMS failed:", e.message);
    return false;
  }
};

// ── Routes ────────────────────────────────────────────────────────────────────

app.get("/", (req, res) => {
  res.json({
    status: "online",
    message: "RoadSOS Emergency Backend",
    version: "2.0.0",
    activeAlerts: db.sosAlerts.filter(a => a.status === "active").length,
    filedReports: db.reports.length,
    uptime: process.uptime(),
    services: {
      firebase: !!firebaseAdmin,
      twilio:   !!twilioClient,
    },
  });
});

// SOS trigger endpoint
app.post("/api/emergency/sos", async (req, res) => {
  const { userId, name, latitude, longitude, contacts, isAutoCrash, mapsLink, liveLocationUrl } = req.body;

  if (latitude === undefined || longitude === undefined) {
    return res.status(400).json({ error: "Latitude and Longitude required." });
  }

  const alertId   = Date.now();
  const timestamp = new Date().toISOString();
  const mapLink   = mapsLink || `https://maps.google.com/?q=${latitude},${longitude}`;
  const liveUrl   = liveLocationUrl || mapLink;

  const alertData = {
    id: alertId, userId, name: name || "Anonymous",
    latitude, longitude, mapLink, liveUrl,
    isAutoCrash: !!isAutoCrash,
    contactsAlerted: contacts || [],
    timestamp, status: "active",
  };

  db.sosAlerts.push(alertData);

  console.log(`\n🚨 SOS RECEIVED (ID: ${alertId})`);
  console.log(`👤 ${alertData.name} | 📍 ${latitude}, ${longitude}`);
  console.log(`⚠️  ${isAutoCrash ? "AUTO-CRASH" : "MANUAL SOS"}`);
  console.log(`📱 Contacts: ${(contacts || []).length}`);

  const fcmTitle = "🚨 EMERGENCY ALERT";
  const fcmBody  = `${name || "Someone"} needs immediate help!`;
  const smsText  = (
    `🚨 ROADSOS EMERGENCY\n${name || "User"} needs help!\n\n` +
    `📍 Live Location (updates every 30s):\n${liveUrl}\n\n` +
    `Maps: ${mapLink}\nTime: ${new Date().toLocaleTimeString("en-IN")} IST`
  );

  let fcmSent = 0, smsSent = 0;

  for (const contact of (contacts || [])) {
    // FCM push (if contact has the app and their token is stored)
    if (contact.fcmToken) {
      const ok = await sendFCMPush(contact.fcmToken, fcmTitle, fcmBody, {
        type: "SOS_ALERT", userId: userId || "", latitude: String(latitude),
        longitude: String(longitude), liveUrl,
      });
      if (ok) fcmSent++;
    }

    // Twilio SMS fallback (or primary if no FCM token)
    if (contact.phone && !contact.fcmToken) {
      const ok = await sendTwilioSMS(contact.phone, smsText);
      if (ok) smsSent++;
    }

    console.log(`  📨 ${contact.name || contact.phone}: FCM=${!!contact.fcmToken} SMS=${!!contact.phone}`);
  }

  // Simulate crowd dispatch
  console.log(`📡 Crowd alerts dispatched to nearby RoadSOS users within 2km\n`);

  res.status(201).json({
    success: true,
    message: `SOS received. ${fcmSent} FCM push(es), ${smsSent} SMS sent, crowd alerted.`,
    alert: alertData,
  });
});

// Cancel SOS — send "All Clear"
app.post("/api/emergency/sos/cancel", async (req, res) => {
  const { userId, userName } = req.body;

  // Mark alert as resolved
  const alert = db.sosAlerts.find(a => a.userId === userId && a.status === "active");
  if (alert) alert.status = "resolved";

  console.log(`\n✅ SOS CANCELLED by ${userName || userId}`);

  // Send "All Clear" FCM to contacts
  if (alert?.contactsAlerted) {
    for (const contact of alert.contactsAlerted) {
      if (contact.fcmToken) {
        await sendFCMPush(
          contact.fcmToken,
          "✅ All Clear",
          `${userName || "User"} is safe. Emergency cancelled.`,
          { type: "SOS_CANCELLED", userId: userId || "" }
        );
      }
      if (contact.phone && twilioClient) {
        await sendTwilioSMS(
          contact.phone,
          `✅ ALL CLEAR: ${userName || "User"} is safe. Emergency cancelled. - RoadSOS`
        );
      }
    }
  }

  res.json({ success: true, message: "All Clear sent to contacts." });
});

// Live location viewer page (simple HTML for contacts without the app)
app.get("/live/:userId", (req, res) => {
  const { userId } = req.params;
  const firebaseDb = process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL || "";
  res.send(`<!DOCTYPE html>
<html>
<head>
  <title>RoadSOS Live Location</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: sans-serif; background: #121214; color: #fff; margin: 0; padding: 20px; }
    h1 { color: #ff4d4d; } .card { background: #1e1e24; border-radius: 12px; padding: 16px; margin: 12px 0; }
    a { color: #2a9d8f; } .badge { display: inline-block; padding: 4px 10px; border-radius: 6px; font-weight: bold; }
    .active { background: #d90429; } .safe { background: #2a9d8f; }
  </style>
</head>
<body>
  <h1>🚨 RoadSOS Live Location</h1>
  <div class="card">
    <p>User ID: <strong>${userId}</strong></p>
    <p id="status"><span class="badge active">🔴 SOS ACTIVE</span></p>
    <p id="coords">Loading location...</p>
    <p id="updated"></p>
    <p><a id="mapsLink" href="#" target="_blank">📍 Open in Google Maps</a></p>
  </div>
  <p style="color:#888;font-size:12px">Location updates every 30 seconds via Firebase</p>
  ${firebaseDb ? `<script type="module">
    import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
    import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js";
    const app = initializeApp({ databaseURL: "${firebaseDb}" });
    const db  = getDatabase(app);
    onValue(ref(db, "sos/${userId}"), snap => {
      const d = snap.val();
      if (!d) { document.getElementById("status").innerHTML = '<span class="badge safe">✅ Safe — SOS Cancelled</span>'; return; }
      document.getElementById("coords").textContent = "Lat: " + d.latitude.toFixed(6) + ", Long: " + d.longitude.toFixed(6);
      document.getElementById("updated").textContent = "Last updated: " + new Date(d.timestamp).toLocaleTimeString("en-IN");
      document.getElementById("mapsLink").href = "https://maps.google.com/?q=" + d.latitude + "," + d.longitude;
      if (!d.active) document.getElementById("status").innerHTML = '<span class="badge safe">✅ Safe — SOS Cancelled</span>';
    });
  </script>` : "<p style='color:#f77f00'>Firebase not configured — real-time tracking unavailable.</p>"}
</body></html>`);
});

// Reports
app.post("/api/reports/submit", (req, res) => {
  const { accidentType, injuredCount, vehicleType, description, latitude, longitude, photoAttached } = req.body;
  if (!accidentType) return res.status(400).json({ error: "accidentType required." });
  const report = { id: Date.now(), accidentType, injuredCount, vehicleType, description, latitude, longitude, photoAttached: !!photoAttached, timestamp: new Date().toISOString(), status: "filed" };
  db.reports.push(report);
  console.log(`\n📋 REPORT FILED: ${accidentType.toUpperCase()} | ${injuredCount} injured`);
  res.status(201).json({ success: true, message: "Report filed.", reportId: report.id });
});

app.get("/api/emergency/alerts", (req, res) => {
  res.json({ count: db.sosAlerts.filter(a => a.status === "active").length, alerts: db.sosAlerts.filter(a => a.status === "active") });
});

app.patch("/api/emergency/alerts/:id/resolve", (req, res) => {
  const alert = db.sosAlerts.find(a => a.id === parseInt(req.params.id));
  if (!alert) return res.status(404).json({ error: "Alert not found." });
  alert.status = "resolved";
  res.json({ success: true, alert });
});

app.get("/api/reports", (req, res) => {
  res.json({ count: db.reports.length, reports: db.reports });
});

// ── Crowd Assistance Routes ───────────────────────────────────────────────────

// Haversine distance in km
const getDistanceKm = (lat1, lng1, lat2, lng2) => {
  const R    = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a    =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const distanceLabel = (km) =>
  km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;

// Send geofenced crowd alert to nearby users
app.post("/api/crowd/send-alert", async (req, res) => {
  const { sosId, victimLat, victimLng, victimName, severity } = req.body;
  const RADIUS_KM = 2.0;

  if (!firebaseAdmin) {
    console.log(`[Crowd] Firebase Admin not configured — skipping crowd alert for ${sosId}`);
    return res.json({ success: true, notified: 0, reason: "firebase_not_configured" });
  }

  try {
    // 1. Get all active user locations
    const snapshot = await firebaseAdmin.database()
      .ref("user_locations")
      .orderByChild("isActive")
      .equalTo(true)
      .once("value");

    const allUsers = snapshot.val() ?? {};

    // 2. Filter users within 2km (exclude victim — distance > 0.05km)
    const nearbyUsers = Object.entries(allUsers)
      .map(([uid, data]) => ({
        uid,
        distance: getDistanceKm(victimLat, victimLng, data.latitude, data.longitude),
        ...data,
      }))
      .filter(u => u.distance <= RADIUS_KM && u.distance > 0.05)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 50);

    if (nearbyUsers.length === 0) {
      console.log(`[Crowd] No nearby users found for ${sosId}`);
      return res.json({ success: true, notified: 0, nearby: 0 });
    }

    // 3. Get FCM tokens
    const tokenPromises = nearbyUsers.map(async (u) => {
      const snap = await firebaseAdmin.database()
        .ref(`users/${u.uid}/fcmToken`)
        .once("value");
      return { uid: u.uid, token: snap.val(), distance: u.distance };
    });
    const usersWithTokens = (await Promise.all(tokenPromises)).filter(u => u.token);

    // 4. Build FCM messages
    const messages = usersWithTokens.map(u => ({
      token: u.token,
      notification: {
        title: "🚨 Accident Nearby — Can You Help?",
        body:  `Someone needs help ${distanceLabel(u.distance)} away. Tap to assist.`,
      },
      data: {
        type:      "CROWD_ASSIST",
        sosId:     sosId || "",
        victimName: "Someone", // privacy — don't expose victim name in notification
        severity:  severity ?? "unknown",
        victimLat: String(victimLat),
        victimLng: String(victimLng),
        distance:  String(u.distance.toFixed(2)),
      },
      android: {
        priority: "high",
        notification: {
          sound:     "default",
          channelId: "crowd_assist",
          priority:  "max",
          vibrateTimingsMillis: [0, 500, 200, 500],
        },
      },
      apns: {
        payload: { aps: { sound: "default", badge: 1 } },
        headers: { "apns-priority": "10" },
      },
    }));

    // 5. Send in batches of 500
    let totalSent = 0;
    for (let i = 0; i < messages.length; i += 500) {
      const batch  = messages.slice(i, i + 500);
      const result = await firebaseAdmin.messaging().sendEach(batch);
      totalSent   += result.successCount;
    }

    console.log(`[Crowd] ${sosId}: notified ${totalSent}/${nearbyUsers.length} nearby users`);
    res.json({ success: true, notified: totalSent, nearby: nearbyUsers.length });

  } catch (err) {
    console.error("[Crowd] send-alert error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Cancel crowd alert — notify all responders SOS is resolved
app.post("/api/crowd/cancel-alert", async (req, res) => {
  const { sosId } = req.body;

  if (!firebaseAdmin) {
    return res.json({ success: true, reason: "firebase_not_configured" });
  }

  try {
    const snap = await firebaseAdmin.database()
      .ref(`sos_events/${sosId}/responders`)
      .once("value");

    const responders = snap.val() ?? {};
    let notified = 0;

    for (const [uid] of Object.entries(responders)) {
      const tokenSnap = await firebaseAdmin.database()
        .ref(`users/${uid}/fcmToken`)
        .once("value");
      const token = tokenSnap.val();
      if (!token) continue;

      try {
        await firebaseAdmin.messaging().send({
          token,
          notification: {
            title: "✅ Emergency Resolved",
            body:  "The person is safe. Thank you for responding!",
          },
          data: { type: "SOS_CANCELLED", sosId: sosId || "" },
        });
        notified++;
      } catch {}
    }

    console.log(`[Crowd] Cancellation sent to ${notified} responders for ${sosId}`);
    res.json({ success: true, notified });

  } catch (err) {
    console.error("[Crowd] cancel-alert error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 RoadSOS Emergency Server v2.0 on port ${PORT}`);
  console.log(`📡 Endpoints:`);
  console.log(`   POST /api/emergency/sos`);
  console.log(`   POST /api/emergency/sos/cancel`);
  console.log(`   GET  /live/:userId`);
  console.log(`   POST /api/reports/submit`);
  console.log(`   GET  /api/emergency/alerts`);
  console.log(`====================================================`);
});
