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

// ============================================================
//  analyzePlant — วิเคราะห์โรคพืชจากรูปด้วย Gemini Vision
//  - รับ: imageBase64 (JPEG), cropName (optional)
//  - ตรวจ: ต้อง login + ไม่เกินโควต้า/วัน
//  - คืน: ผลวิเคราะห์ภาษาไทย + บันทึกประวัติส่วนตัว
// ============================================================
const { defineSecret } = require("firebase-functions/params");
const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

const DAILY_QUOTA = 5; // วิเคราะห์ได้กี่ครั้ง/วัน (ปรับได้)

exports.analyzePlant = onCall(
  { secrets: [GEMINI_API_KEY] },
  async (req) => {
    const uid = req.auth && req.auth.uid;
    if (!uid) throw new HttpsError("unauthenticated", "ต้องเข้าสู่ระบบก่อน");

    const imageBase64 = req.data && req.data.imageBase64;
    const cropName = (req.data && req.data.cropName) || "พืชทั่วไป";
    if (!imageBase64 || typeof imageBase64 !== "string") {
      throw new HttpsError("invalid-argument", "ต้องส่งรูปภาพมาด้วย");
    }

    const db = admin.firestore();

    // ── เช็คโควต้ารายวัน ──────────────────────────────────
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const quotaRef = db.collection("users").doc(uid)
      .collection("aiUsage").doc(today);
    const quotaSnap = await quotaRef.get();
    const usedToday = quotaSnap.exists ? (quotaSnap.data().count || 0) : 0;
    if (usedToday >= DAILY_QUOTA) {
      throw new HttpsError("resource-exhausted",
        `วันนี้ใช้ครบ ${DAILY_QUOTA} ครั้งแล้ว ลองใหม่พรุ่งนี้นะครับ 🌱`);
    }

    // ── เรียก Gemini Vision ───────────────────────────────
    const prompt = `คุณคือผู้เชี่ยวชาญโรคพืชของไทย วิเคราะห์รูปนี้ซึ่งเป็น "${cropName}"
ตอบเป็นภาษาไทยในรูปแบบ JSON เท่านั้น ห้ามมีข้อความอื่นนอก JSON:
{
  "disease": "ชื่อโรคที่คาดว่าเป็น (ภาษาไทย)",
  "confidence": "ระดับความมั่นใจ: สูง/กลาง/ต่ำ",
  "healthy": true/false (ถ้าพืชดูแข็งแรงดีไม่มีโรค ให้เป็น true),
  "symptoms": "อาการที่สังเกตเห็นจากรูป",
  "cause": "สาเหตุของโรค",
  "treatment": "วิธีรักษาและป้องกันเบื้องต้น เป็นขั้นตอนสั้นๆ",
  "advice": "คำแนะนำเพิ่มเติมสำหรับชาวสวน"
}
ถ้ารูปไม่ชัดหรือไม่ใช่พืช ให้ disease = "ไม่สามารถวิเคราะห์ได้" และอธิบายใน advice`;

    const geminiUrl =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" +
      GEMINI_API_KEY.value();

    let result;
    try {
      const geminiRes = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: "image/jpeg", data: imageBase64 } },
            ],
          }],
          generationConfig: {
  temperature: 0.4,
  maxOutputTokens: 2048,
  responseMimeType: "application/json",
  thinkingConfig: { thinkingBudget: 0 },
},
        }),
      });
      if (!geminiRes.ok) {
        const errText = await geminiRes.text();
        console.error("Gemini error:", geminiRes.status, errText);
        throw new HttpsError("internal", "AI วิเคราะห์ไม่สำเร็จ ลองใหม่อีกครั้ง");
      }
      const geminiData = await geminiRes.json();
      const text =
        geminiData.candidates &&
        geminiData.candidates[0] &&
        geminiData.candidates[0].content &&
        geminiData.candidates[0].content.parts[0].text;
      if (!text) throw new HttpsError("internal", "AI ไม่ตอบกลับ ลองใหม่อีกครั้ง");

      // ดึง JSON จากข้อความ (เผื่อมี markdown fences)
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      result = jsonMatch ? JSON.parse(jsonMatch[0]) : { disease: "ไม่สามารถวิเคราะห์ได้", advice: text };
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      console.error("analyzePlant error:", err);
      throw new HttpsError("internal", "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง");
    }

    // ── จับคู่สินค้าแนะนำจาก config (ส่ง mapping มาจาก client) ──
    // client จะแนบ productHints มาให้ (id->name) เพื่อ map กับชื่อโรค
    // (ทำ matching ง่ายๆ ฝั่ง client จะยืดหยุ่นกว่า)

    // ── เพิ่มตัวนับโควต้า + บันทึกประวัติ ──────────────────
    await quotaRef.set({
      count: admin.firestore.FieldValue.increment(1),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    const diagRef = await db.collection("users").doc(uid)
      .collection("diagnoses").add({
        crop: cropName,
        result: result,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    return {
      id: diagRef.id,
      result: result,
      quotaLeft: DAILY_QUOTA - usedToday - 1,
    };
  }
);
