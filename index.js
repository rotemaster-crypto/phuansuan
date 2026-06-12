// ============================================================
//  functions/index.js — เพื่อนสวน Cloud Functions
//  lineAuth: ตรวจสอบ LINE access token ฝั่ง server
//            แล้วออก Firebase custom token (uid = LINE userId)
//            + ติด custom claim admin ให้ Roger
// ============================================================

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");

admin.initializeApp();
setGlobalOptions({ region: "asia-southeast1", maxInstances: 10 });

// ── ค่าคงที่ (ไม่ใช่ secret — Channel ID เป็น public) ──────
const LINE_CHANNEL_ID = "2010356906";
const ADMIN_LINE_ID = "U03582167674331d9005dfb42728c7151";

// ── lineAuth ──────────────────────────────────────────────
// Client ส่ง LIFF access token มา → เราตรวจกับ LINE API ว่า
// 1) token ยังไม่หมดอายุ  2) ออกโดย Channel ของเราจริง
// แล้วจึงดึง profile และออก custom token ให้
exports.lineAuth = onCall(async (req) => {
  const accessToken = req.data?.accessToken;
  if (!accessToken || typeof accessToken !== "string") {
    throw new HttpsError("invalid-argument", "ต้องส่ง accessToken มาด้วย");
  }

  // 1) Verify token กับ LINE
  const verifyRes = await fetch(
    "https://api.line.me/oauth2/v2.1/verify?access_token=" +
      encodeURIComponent(accessToken)
  );
  const verifyData = await verifyRes.json();
  if (
    !verifyRes.ok ||
    verifyData.client_id !== LINE_CHANNEL_ID ||
    !(verifyData.expires_in > 0)
  ) {
    throw new HttpsError("unauthenticated", "LINE token ไม่ถูกต้องหรือหมดอายุ");
  }

  // 2) ดึง profile จาก LINE (เชื่อข้อมูลจาก LINE เท่านั้น ไม่เชื่อ client)
  const profileRes = await fetch("https://api.line.me/v2/profile", {
    headers: { Authorization: "Bearer " + accessToken },
  });
  if (!profileRes.ok) {
    throw new HttpsError("unauthenticated", "ดึง LINE profile ไม่สำเร็จ");
  }
  const profile = await profileRes.json(); // { userId, displayName, pictureUrl }

  // 3) ออก Firebase custom token — uid = LINE userId
  const isAdmin = profile.userId === ADMIN_LINE_ID;
  const token = await admin
    .auth()
    .createCustomToken(profile.userId, { admin: isAdmin });

  return {
    token,
    profile: {
      userId: profile.userId,
      displayName: profile.displayName || "",
      pictureUrl: profile.pictureUrl || "",
    },
    isAdmin,
  };
});
