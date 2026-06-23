// ============================================================
//  functions/index.js — เพื่อนสวน / Bocean (multi-tenant)
//  lineAuth: ตรวจ LINE token → custom token (uid = LINE userId)
//            + claim admin + claim tenants:{[tid]:true}
//  ทุก trigger/helper ทำงานใต้ tenants/{tid}/...
// ============================================================

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");

admin.initializeApp();
setGlobalOptions({ region: "asia-southeast1", maxInstances: 10 });

// ── ค่าคงที่ ──────────────────────────────────────────────
const LINE_CHANNEL_ID = "2010356906";
const ADMIN_LINE_ID = "U03582167674331d9005dfb42728c7151";
// tenant แบบ data-driven: ตรวจจาก doc tenants/{tid} (cache 60 วิ)
// เพิ่มแบรนด์ใหม่ = สร้าง doc tenants/{tid} (status != suspended) ไม่ต้องแก้/redeploy โค้ด
const _tenantCache = {};
async function resolveTid(reqTid) {
  const x = (reqTid || "").toString();
  if (!x) return "phuansuan";
  const now = Date.now();
  const c = _tenantCache[x];
  if (c && (now - c.at) < 60000) return c.ok ? x : "phuansuan";
  let ok = false;
  try {
    const s = await admin.firestore().collection("tenants").doc(x).get();
    ok = s.exists && s.data().status !== "suspended";
  } catch (e) { ok = false; }
  _tenantCache[x] = { ok: ok, at: now };
  return ok ? x : "phuansuan";
}
// document ราก ของ tenant — ใช้สร้าง path tenants/{tid}/...
function troot(tid) {
  return admin.firestore().collection("tenants").doc(tid);
}

// ── lineAuth ──────────────────────────────────────────────
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

  // 2) ดึง profile จาก LINE (เชื่อข้อมูลจาก LINE เท่านั้น)
  const profileRes = await fetch("https://api.line.me/v2/profile", {
    headers: { Authorization: "Bearer " + accessToken },
  });
  if (!profileRes.ok) {
    throw new HttpsError("unauthenticated", "ดึง LINE profile ไม่สำเร็จ");
  }
  const profile = await profileRes.json();

  // 3) ออก custom token — uid = LINE userId + claim admin + tenants
  const isAdmin = profile.userId === ADMIN_LINE_ID;
  const tid = await resolveTid(req.data?.tid);
  const token = await admin
    .auth()
    .createCustomToken(profile.userId, { admin: isAdmin, tenants: { [tid]: true } });

  return {
    token,
    profile: {
      userId: profile.userId,
      displayName: profile.displayName || "",
      pictureUrl: profile.pictureUrl || "",
    },
    isAdmin,
    tid,
  };
});

// ============================================================
//  analyzePlant — วิเคราะห์โรคพืชจากรูปด้วย Gemini Vision
// ============================================================
const { defineSecret } = require("firebase-functions/params");
const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

const DAILY_QUOTA = 5;

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

    const tid = await resolveTid(req.data && req.data.tid);

    // ── เช็คโควต้ารายวัน (ใต้ tenant) ─────────────────────
    const today = new Date().toISOString().slice(0, 10);
    const quotaRef = troot(tid).collection("users").doc(uid)
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

    // ── เพิ่มตัวนับโควต้า + บันทึกประวัติ (ใต้ tenant) ──────
    await quotaRef.set({
      count: admin.firestore.FieldValue.increment(1),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    const diagRef = await troot(tid).collection("users").doc(uid)
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
//  POINT TRIGGERS — ให้แต้มฝั่ง server (ใต้ tenants/{tid}/...)
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
// P2: อ่านแต้ม/tier จาก tenants/{tid}/settings/points (cache 60 วิ ต่อ tenant)
let _ptsCache = {}, _ptsAt = {};
function _num(v, fb){
  if (typeof v === "number" && !isNaN(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v))) return Number(v);
  return fb;
}
async function getPts(tid) {
  const now = Date.now();
  if (_ptsCache[tid] && (now - (_ptsAt[tid] || 0)) < 60000) return _ptsCache[tid];
  let d = {};
  try { const s = await troot(tid).collection("settings").doc("points").get(); if (s.exists) d = s.data() || {}; }
  catch (e) { /* ใช้ fallback */ }
  const P = {
    perPost:        _num(d.perPost,        PTS.perPost),
    perPostWithImg: _num(d.perPostWithImg, PTS.perPostWithImg),
    perComment:     _num(d.perComment,     PTS.perComment),
    perHelp:        _num(d.perHelp,        PTS.perHelp),
    perLike:        _num(d.perLike,        PTS.perLike),
    tiers: [
      { key: "platinum", min: _num(d.tierPlatinum, 6000) },
      { key: "gold",     min: _num(d.tierGold,     3000) },
      { key: "silver",   min: _num(d.tierSilver,   1000) },
      { key: "bronze",   min: 0 },
    ],
  };
  _ptsCache[tid] = P; _ptsAt[tid] = now; return P;
}
function calcTier(pts, tiers) {
  const list = tiers || TIERS;
  for (const t of list) { if (pts >= t.min) return t.key; }
  return "bronze";
}
async function updateTier(userRef, tid) {
  const P = await getPts(tid);
  const snap = await userRef.get();
  const pts = snap.data()?.points || 0;
  const newTier = calcTier(pts, P.tiers);
  if (snap.data()?.tier !== newTier) await userRef.update({ tier: newTier });
}

exports.onPostCreated = onDocumentCreated(
  { document: "tenants/{tid}/posts/{postId}", region: "asia-southeast1" },
  async (event) => {
    const post = event.data?.data();
    if (!post?.authorId) return;
    const tid = event.params.tid;
    const P = await getPts(tid);
    const pts = post.imageUrl ? P.perPostWithImg : P.perPost;
    const ref = troot(tid).collection("users").doc(post.authorId);
    await ref.update({
      points:    admin.firestore.FieldValue.increment(pts),
      postCount: admin.firestore.FieldValue.increment(1),
    });
    await updateTier(ref, tid);
  }
);

exports.onCommentCreated = onDocumentCreated(
  { document: "tenants/{tid}/posts/{postId}/comments/{commentId}", region: "asia-southeast1" },
  async (event) => {
    const cmt = event.data?.data();
    if (!cmt?.authorId) return;
    const tid = event.params.tid;
    const postRef = troot(tid).collection("posts").doc(event.params.postId);
    await postRef.update({ comments: admin.firestore.FieldValue.increment(1) }).catch(() => {});
    const marker = postRef.collection("commentAwarded").doc(cmt.authorId);
    if ((await marker.get()).exists) return;
    await marker.set({ at: admin.firestore.FieldValue.serverTimestamp() });
    const ref = troot(tid).collection("users").doc(cmt.authorId);
    const P = await getPts(tid);
    await ref.update({ points: admin.firestore.FieldValue.increment(P.perComment) });
    await updateTier(ref, tid);
  }
);

const { onDocumentDeleted } = require("firebase-functions/v2/firestore");
exports.onCommentDeleted = onDocumentDeleted(
  { document: "tenants/{tid}/posts/{postId}/comments/{commentId}", region: "asia-southeast1" },
  async (event) => {
    await troot(event.params.tid).collection("posts").doc(event.params.postId)
      .update({ comments: admin.firestore.FieldValue.increment(-1) }).catch(() => {});
  }
);

// ── ไลก์/ช่วยได้ → server-side ──
const { onDocumentWritten } = require("firebase-functions/v2/firestore");

async function awardOnce(tid, postId, actorUid, markerCol, authorId, pts, extra) {
  if (!authorId || actorUid === authorId) return;
  const marker = troot(tid).collection("posts").doc(postId).collection(markerCol).doc(actorUid);
  const got = await marker.get();
  if (got.exists) return;
  await marker.set({ at: admin.firestore.FieldValue.serverTimestamp() });
  const uref = troot(tid).collection("users").doc(authorId);
  await uref.update(Object.assign({ points: admin.firestore.FieldValue.increment(pts) }, extra || {}));
  await updateTier(uref, tid);
}

exports.onLikeWrite = onDocumentWritten(
  { document: "tenants/{tid}/posts/{postId}/likes/{uid}", region: "asia-southeast1" },
  async (event) => {
    const before = event.data?.before, after = event.data?.after;
    const had = before?.exists, has = after?.exists;
    const tid = event.params.tid;
    const postRef = troot(tid).collection("posts").doc(event.params.postId);
    const inc = admin.firestore.FieldValue.increment;
    if (!had && has) {
      const p = await postRef.get(); if (!p.exists) return;
      const type = after.data().type || "like";
      await postRef.update({ likes: inc(1), ["reactions." + type]: inc(1) });
      const P = await getPts(tid);
      await awardOnce(tid, event.params.postId, event.params.uid, "likeAwarded", p.data().authorId, P.perLike);
    } else if (had && !has) {
      const p = await postRef.get(); if (!p.exists) return;
      const type = before.data().type || "like";
      await postRef.update({ likes: inc(-1), ["reactions." + type]: inc(-1) });
    } else if (had && has) {
      const ot = before.data().type || "like", nt = after.data().type || "like";
      if (ot !== nt) {
        const p = await postRef.get(); if (!p.exists) return;
        await postRef.update({ ["reactions." + ot]: inc(-1), ["reactions." + nt]: inc(1) });
      }
    }
  }
);

exports.onHelpWrite = onDocumentWritten(
  { document: "tenants/{tid}/posts/{postId}/helps/{uid}", region: "asia-southeast1" },
  async (event) => {
    const had = event.data?.before?.exists, has = event.data?.after?.exists;
    const tid = event.params.tid;
    const postRef = troot(tid).collection("posts").doc(event.params.postId);
    if (!had && has) {
      const p = await postRef.get(); if (!p.exists) return;
      await postRef.update({ helps: admin.firestore.FieldValue.increment(1) });
      const P = await getPts(tid);
      await awardOnce(tid, event.params.postId, event.params.uid, "helpAwarded", p.data().authorId, P.perHelp, { helpCount: admin.firestore.FieldValue.increment(1) });
    } else if (had && !has) {
      const p = await postRef.get(); if (!p.exists) return;
      await postRef.update({ helps: admin.firestore.FieldValue.increment(-1) });
    }
  }
);

const { onDocumentUpdated: onDocUpd } = require("firebase-functions/v2/firestore");
async function sendNotif(tid, uid, text, icon) {
  if (!uid) return;
  await troot(tid).collection("notifications").add({ uid, text, icon: icon || "bell", read: false, createdAt: admin.firestore.FieldValue.serverTimestamp() });
  const uSnap = await troot(tid).collection("users").doc(uid).get();
  const token = uSnap.data() && uSnap.data().fcmToken;
  if (!token) return;
  try {
    await admin.messaging().send({ token, notification: { title: "phuansuan", body: text }, webpush: { notification: { icon: "/icons/icon-192.png" } } });
  } catch (e) {
    if (e.code === "messaging/registration-token-not-registered") {
      await troot(tid).collection("users").doc(uid).update({ fcmToken: admin.firestore.FieldValue.delete() });
    }
  }
}

exports.onCommentNotify = onDocumentCreated(
  { document: "tenants/{tid}/posts/{postId}/comments/{commentId}", region: "asia-southeast1" },
  async (event) => {
    const cmt = event.data && event.data.data();
    if (!cmt || !cmt.authorId) return;
    const tid = event.params.tid;
    const pSnap = await troot(tid).collection("posts").doc(event.params.postId).get();
    const post = pSnap.data();
    if (!post || !post.authorId || post.authorId === cmt.authorId) return;
    await sendNotif(tid, post.authorId, (cmt.authorName || "มีผู้ใช้") + " แสดงความคิดเห็นในโพสของคุณ", "comment");
  }
);

exports.onHelpNotify = onDocUpd(
  { document: "tenants/{tid}/posts/{postId}", region: "asia-southeast1" },
  async (event) => {
    const b = event.data && event.data.before && event.data.before.data();
    const a = event.data && event.data.after && event.data.after.data();
    if (!b || !a) return;
    if ((a.helps || 0) <= (b.helps || 0) || !a.authorId) return;
    await sendNotif(event.params.tid, a.authorId, "มีคนกดว่าโพสของคุณช่วยได้", "help");
  }
);

exports.onTierUpgrade = onDocUpd(
  { document: "tenants/{tid}/users/{uid}", region: "asia-southeast1" },
  async (event) => {
    const b = event.data && event.data.before && event.data.before.data();
    const a = event.data && event.data.after && event.data.after.data();
    if (!b || !a || b.tier === a.tier) return;
    const label = { bronze: "มือใหม่", silver: "เงิน", gold: "ทอง", platinum: "ปราชญ์" };
    await sendNotif(event.params.tid, event.params.uid, "ยินดีด้วย! คุณเลื่อนระดับเป็น " + (label[a.tier] || a.tier), "tier");
  }
);
