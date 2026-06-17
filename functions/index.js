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
     try {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  result = JSON.parse(jsonMatch ? jsonMatch[0] : text);
} catch (parseErr) {
  console.error("JSON parse failed:", text);
  result = {
    disease: "ไม่สามารถวิเคราะห์ได้",
    advice: "AI ตอบกลับไม่สมบูรณ์ ลองถ่ายรูปใหม่ให้ชัดขึ้นแล้ววิเคราะห์อีกครั้งนะครับ 🌱",
  };
}
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

// ============================================================
//  POINT TRIGGERS — ให้แต้มฝั่ง server (ปลอมจาก client ไม่ได้)
// ============================================================
const { onDocumentCreated, onDocumentUpdated } =
  require("firebase-functions/v2/firestore");

const PTS = {
  perPost: 10, perPostWithImg: 15, perComment: 3, perHelp: 15, perLike: 2,
};
const TIERS = [
  { key: "platinum", min: 6000 }, { key: "gold", min: 3000 },
  { key: "silver",   min: 1000 }, { key: "bronze", min: 0 },
];
function calcTier(pts) {
  for (const t of TIERS) { if (pts >= t.min) return t.key; }
  return "bronze";
}
async function updateTier(userRef) {
  const snap = await userRef.get();
  const pts = snap.data()?.points || 0;
  const newTier = calcTier(pts);
  if (snap.data()?.tier !== newTier) await userRef.update({ tier: newTier });
}

exports.onPostCreated = onDocumentCreated(
  { document: "posts/{postId}", region: "asia-southeast1" },
  async (event) => {
    const post = event.data?.data();
    if (!post?.authorId) return;
    const pts = post.imageUrl ? PTS.perPostWithImg : PTS.perPost;
    const ref = admin.firestore().collection("users").doc(post.authorId);
    await ref.update({
      points:    admin.firestore.FieldValue.increment(pts),
      postCount: admin.firestore.FieldValue.increment(1),
    });
    await updateTier(ref);
  }
);

exports.onCommentCreated = onDocumentCreated(
  { document: "posts/{postId}/comments/{commentId}", region: "asia-southeast1" },
  async (event) => {
    const cmt = event.data?.data();
    if (!cmt?.authorId) return;
    // นับคอมเมนต์ฝั่ง server (client แก้ไม่ได้แล้ว)
    await admin.firestore().collection("posts").doc(event.params.postId)
      .update({ comments: admin.firestore.FieldValue.increment(1) }).catch(() => {});
    const ref = admin.firestore().collection("users").doc(cmt.authorId);
    await ref.update({ points: admin.firestore.FieldValue.increment(PTS.perComment) });
    await updateTier(ref);
  }
);

// ลบคอมเมนต์ → ลดตัวนับ (กันค้างเกินจริง)
const { onDocumentDeleted } = require("firebase-functions/v2/firestore");
exports.onCommentDeleted = onDocumentDeleted(
  { document: "posts/{postId}/comments/{commentId}", region: "asia-southeast1" },
  async (event) => {
    await admin.firestore().collection("posts").doc(event.params.postId)
      .update({ comments: admin.firestore.FieldValue.increment(-1) }).catch(() => {});
  }
);

// ── ไลก์/ช่วยได้ → server-side: 1 คน/โพส, ให้แต้มเจ้าของครั้งเดียว ──
const { onDocumentWritten } = require("firebase-functions/v2/firestore");

async function awardOnce(db, postId, actorUid, markerCol, authorId, pts, extra) {
  if (!authorId || actorUid === authorId) return;        // ไม่ให้แต้มกดของตัวเอง
  const marker = db.collection("posts").doc(postId).collection(markerCol).doc(actorUid);
  const got = await marker.get();
  if (got.exists) return;                                 // เคยให้แต้มแล้ว ข้าม
  await marker.set({ at: admin.firestore.FieldValue.serverTimestamp() });
  const uref = db.collection("users").doc(authorId);
  await uref.update(Object.assign({ points: admin.firestore.FieldValue.increment(pts) }, extra || {}));
  await updateTier(uref);
}

exports.onLikeWrite = onDocumentWritten(
  { document: "posts/{postId}/likes/{uid}", region: "asia-southeast1" },
  async (event) => {
    const had = event.data?.before?.exists, has = event.data?.after?.exists;
    const db = admin.firestore();
    const postRef = db.collection("posts").doc(event.params.postId);
    if (!had && has) {
      const p = await postRef.get(); if (!p.exists) return;
      await postRef.update({ likes: admin.firestore.FieldValue.increment(1) });
      await awardOnce(db, event.params.postId, event.params.uid, "likeAwarded", p.data().authorId, PTS.perLike);
    } else if (had && !has) {
      const p = await postRef.get(); if (!p.exists) return;
      await postRef.update({ likes: admin.firestore.FieldValue.increment(-1) });
    }
  }
);

exports.onHelpWrite = onDocumentWritten(
  { document: "posts/{postId}/helps/{uid}", region: "asia-southeast1" },
  async (event) => {
    const had = event.data?.before?.exists, has = event.data?.after?.exists;
    const db = admin.firestore();
    const postRef = db.collection("posts").doc(event.params.postId);
    if (!had && has) {
      const p = await postRef.get(); if (!p.exists) return;
      await postRef.update({ helps: admin.firestore.FieldValue.increment(1) });
      await awardOnce(db, event.params.postId, event.params.uid, "helpAwarded", p.data().authorId, PTS.perHelp, { helpCount: admin.firestore.FieldValue.increment(1) });
    } else if (had && !has) {
      const p = await postRef.get(); if (!p.exists) return;
      await postRef.update({ helps: admin.firestore.FieldValue.increment(-1) });
    }
  }
);

const{onDocumentUpdated:onDocUpd}=require("firebase-functions/v2/firestore");
async function sendNotif(db,uid,text,icon){if(!uid)return;await db.collection("notifications").add({uid,text,icon:icon||"bell",read:false,createdAt:admin.firestore.FieldValue.serverTimestamp()});const uSnap=await db.collection("users").doc(uid).get();const token=uSnap.data()&&uSnap.data().fcmToken;if(!token)return;try{await admin.messaging().send({token,notification:{title:"phuansuan",body:text},webpush:{notification:{icon:"/icons/icon-192.png"}}})}catch(e){if(e.code==="messaging/registration-token-not-registered"){await db.collection("users").doc(uid).update({fcmToken:admin.firestore.FieldValue.delete()})}}}
exports.onCommentNotify=onDocumentCreated({document:"posts/{postId}/comments/{commentId}",region:"asia-southeast1"},async(event)=>{const cmt=event.data&&event.data.data();if(!cmt||!cmt.authorId)return;const db=admin.firestore();const pSnap=await db.collection("posts").doc(event.params.postId).get();const post=pSnap.data();if(!post||!post.authorId||post.authorId===cmt.authorId)return;await sendNotif(db,post.authorId,(cmt.authorName||"someone")+" commented on your post","comment")});
exports.onHelpNotify=onDocUpd({document:"posts/{postId}",region:"asia-southeast1"},async(event)=>{const b=event.data&&event.data.before&&event.data.before.data();const a=event.data&&event.data.after&&event.data.after.data();if(!b||!a)return;if((a.helps||0)<=(b.helps||0)||!a.authorId)return;await sendNotif(admin.firestore(),a.authorId,"Someone marked your post as helpful","help")});
exports.onTierUpgrade=onDocUpd({document:"users/{uid}",region:"asia-southeast1"},async(event)=>{const b=event.data&&event.data.before&&event.data.before.data();const a=event.data&&event.data.after&&event.data.after.data();if(!b||!a||b.tier===a.tier)return;const label={bronze:"Bronze",silver:"Silver",gold:"Gold",platinum:"Platinum"};await sendNotif(admin.firestore(),event.params.uid,"Congrats! You reached "+( label[a.tier]||a.tier),"tier")});
