// ============================================================
//  functions/index.js — เพื่อนสวน / Bocean (multi-tenant)
//  lineAuth: ตรวจ LINE token → custom token (uid = LINE userId)
//            + claim admin + claim tenants:{[tid]:true}
//  ทุก trigger/helper ทำงานใต้ tenants/{tid}/...
// ============================================================

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const crypto = require("crypto");

admin.initializeApp();
setGlobalOptions({ region: "asia-southeast1", maxInstances: 10 });

// ── ค่าคงที่ ──────────────────────────────────────────────
const LINE_CHANNEL_ID = "2010356906";
const ADMIN_LINE_ID = "U03582167674331d9005dfb42728c7151";
// tenant แบบ data-driven: ตรวจจาก doc tenants/{tid} (cache 60 วิ)
// เพิ่มแบรนด์ใหม่ = สร้าง doc tenants/{tid} (status != suspended) ไม่ต้องแก้/redeploy โค้ด
const _tenantCache = {};
// alias ฝั่ง client ที่ "จงใจ" ใช้ข้อมูลร่วมกับอีก tenant (ไม่ใช่ doc จริง)
// เช่น 'office' = skin โซเชียลของ phuansuan (ดู config.js domains/overrides).
// เพิ่ม alias ใหม่ที่นี่เท่านั้น — tid อื่นที่ไม่มี doc จริงจะถูกปฏิเสธ (fail-closed)
const TENANT_ALIASES = { office: "phuansuan" };
// resolveTid: fail-CLOSED. ปฏิเสธ tid ว่าง/ไม่มีจริง/ถูก suspend และปฏิเสธเมื่ออ่าน
// Firestore ไม่สำเร็จ (ไม่ fallback ไป phuansuan, ไม่ cache ผลจาก error)
// เดิม fallback ไป "phuansuan" เงียบ ๆ ทุกกรณี -> error ชั่วคราวทำข้อมูล tenant อื่น
// ไหลลง phuansuan (cache 60 วิ). ตอนนี้แก้ให้ throw แทน (root-B: ล้มแบบปลอดภัย)
async function resolveTid(reqTid) {
  let x = (reqTid || "").toString().trim();
  if (!x) {
    throw new HttpsError("invalid-argument", "ต้องระบุร้าน (tid) ให้ถูกต้อง");
  }
  if (TENANT_ALIASES[x]) x = TENANT_ALIASES[x]; // resolve alias ก่อน lookup
  const now = Date.now();
  const c = _tenantCache[x];
  if (c && (now - c.at) < 60000) {
    if (!c.ok) throw new HttpsError("failed-precondition", "ไม่พบร้าน (tenant) หรือถูกระงับ: " + x);
    return x;
  }
  let snap;
  try {
    snap = await admin.firestore().collection("tenants").doc(x).get();
  } catch (e) {
    // fail-closed: อย่ากลืน error เป็น "ไม่มี tenant" แล้ว fallback — ให้ client retry
    throw new HttpsError("unavailable", "ตรวจสอบร้าน (tenant) ไม่สำเร็จ กรุณาลองใหม่");
  }
  const ok = snap.exists && snap.data() && snap.data().status !== "suspended";
  _tenantCache[x] = { ok: ok, at: now };
  if (!ok) throw new HttpsError("failed-precondition", "ไม่พบร้าน (tenant) หรือถูกระงับ: " + x);
  return x;
}
// document ราก ของ tenant — ใช้สร้าง path tenants/{tid}/...
function troot(tid) {
  return admin.firestore().collection("tenants").doc(tid);
}

// ── B5: คุมการเข้าเป็นสมาชิก (closed tenants) ─────────────
// ให้ membership เฉพาะเมื่อ request มาจากโดเมนของร้านนั้นจริง (origin ∈ tenant.domains)
// → กัน browser ของร้าน A เข้าเป็นสมาชิกร้าน B
// ข้อจำกัด: origin ปลอมได้จาก client ที่ไม่ใช่ browser (curl) → ต้องเสริม App Check ภายหลัง
function _originHostAllowed(host, domains) {
  if (!Array.isArray(domains) || domains.length === 0) return true; // ยังไม่ตั้ง domains → ไม่บังคับ
  return !!host && domains.includes(host);
}
function _originHost(req) {
  try {
    const h = (req && req.rawRequest && req.rawRequest.headers) || {};
    const o = h.origin || h.referer || "";
    return o ? new URL(o).hostname : "";
  } catch (e) { return ""; }
}
async function assertTenantOrigin(tid, req) {
  if (process.env.FUNCTIONS_EMULATOR === "true") return;   // ข้ามใน emulator/dev (test)
  let domains = [];
  try {
    const s = await troot(tid).get();
    if (s.exists && Array.isArray(s.data().domains)) domains = s.data().domains;
  } catch (e) { return; }   // อ่าน tenant ไม่ได้ (error ชั่วคราว) → ปล่อยผ่าน
  if (!_originHostAllowed(_originHost(req), domains)) {
    throw new HttpsError("permission-denied", "เข้าเป็นสมาชิกได้เฉพาะจากเว็บของร้านนี้");
  }
}
exports._originHostAllowed = _originHostAllowed;   // สำหรับ unit test

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

  // 3) ออก custom token — uid = LINE userId + claim admin + tenants + tadmin/towner
  const isAdmin = profile.userId === ADMIN_LINE_ID;
  const tid = await resolveTid(req.data?.tid);

  // หา tenant ที่ user เป็น owner/admin → claim tadmin (จัดการได้) + towner (เจ้าของ)
  const tadmin = {};
  const towner = {};
  try {
    const fdb = admin.firestore();
    const [ownSnap, admSnap] = await Promise.all([
      fdb.collection("tenants").where("ownerLineId", "==", profile.userId).get(),
      fdb.collection("tenants").where("adminLineIds", "array-contains", profile.userId).get(),
    ]);
    ownSnap.forEach((d) => { tadmin[d.id] = true; towner[d.id] = true; });
    admSnap.forEach((d) => { tadmin[d.id] = true; });
  } catch (e) {
    console.warn("tadmin lookup failed:", e && e.message);
  }

  // B5 note: membership ที่นี่ (tenants[tid]) มาจาก tid ฝั่ง client เช่นกัน แต่ tid ของ
  //   browser มาจากโดเมน (config.js) — จะส่ง tid ผิดต้องผ่าน XSS (ปิดแล้ว A2) หรือ client
  //   ที่ไม่ใช่ browser (ต้อง App Check). ไม่ gate ด้วย origin ที่นี่เพราะเสี่ยงทำ login พัง
  //   ทั้งระบบถ้า tenant.domains ไม่ครบ (path login หลัก) — closure เต็มรอ App Check
  const token = await admin
    .auth()
    .createCustomToken(profile.userId, { admin: isAdmin, tenants: { [tid]: true }, tadmin: tadmin, towner: towner });

  return {
    token,
    profile: {
      userId: profile.userId,
      displayName: profile.displayName || "",
      pictureUrl: profile.pictureUrl || "",
    },
    isAdmin,
    isTenantAdmin: Object.keys(tadmin).length > 0,
    adminTenants: tadmin,
    ownerTenants: towner,
    tid,
  };
});

// ── claimTenant ───────────────────────────────────────────
// ผู้ใช้ที่ login ผ่าน provider เนทีฟ (Google/Facebook) ยังไม่มี
// claim tenants → เรียกฟังก์ชันนี้หลัง login เพื่อเติม claim
// (merge ของเดิม กัน admin / tenant อื่นหาย)
exports.claimTenant = onCall(async (req) => {
  const uid = req.auth && req.auth.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "ต้อง login ก่อน");
  }
  const tid = await resolveTid(req.data && req.data.tid);
  // B5: ให้ membership เฉพาะเมื่อ request มาจากโดเมนของร้านนี้จริง (closed tenants)
  await assertTenantOrigin(tid, req);

  const userRec = await admin.auth().getUser(uid);
  const prev = userRec.customClaims || {};
  const tenants = Object.assign({}, prev.tenants || {});
  tenants[tid] = true;
  const claims = Object.assign({}, prev, { tenants: tenants });

  await admin.auth().setCustomUserClaims(uid, claims);
  return { ok: true, tid: tid };
});

// ── dailyLoginBonus ───────────────────────────────────────
// ให้แต้มเข้าระบบรายวัน "ฝั่ง server" (idempotent ต่อวันตามเขตเวลาไทย)
// ย้ายมาจาก client (index.html) ที่เดิม increment points เอง → กันปั๊มแต้ม (A5)
// ตัดสินวันด้วยเวลา server (UTC+7) ไม่เชื่อ client; lastBonusDay ถูกล็อกไม่ให้ client แก้ (ดู rules)
function bkkDayKey() {
  // วันปฏิทินตามเขต Asia/Bangkok (UTC+7, ไม่มี DST) รูปแบบ YYYY-MM-DD
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}
exports.dailyLoginBonus = onCall(async (req) => {
  const uid = req.auth && req.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "ต้อง login ก่อน");
  const tid = await resolveTid(req.data && req.data.tid);
  const P = await getPts(tid);
  const bonus = Math.max(0, Math.floor(Number(P.dailyLoginBonus) || 0));
  const userRef = troot(tid).collection("users").doc(uid);
  const dayKey = bkkDayKey();
  return admin.firestore().runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) throw new HttpsError("failed-precondition", "ยังไม่มีบัญชีผู้ใช้");
    const d = snap.data();
    const cur = Math.max(0, Math.floor(Number(d.points) || 0));
    if (d.lastBonusDay === dayKey || bonus === 0) {
      return { granted: 0, day: dayKey, points: cur, tier: d.tier || calcTier(cur, P.tiers) };
    }
    const next = cur + bonus;
    const tier = calcTier(next, P.tiers);
    tx.update(userRef, {
      points: next,
      lastBonusDay: dayKey,
      tier: tier,
      lastLoginAt: FieldValue.serverTimestamp(),
    });
    return { granted: bonus, day: dayKey, points: next, tier: tier };
  });
});

// ============================================================
//  spinLuckyDraw — สุ่มจับรางวัล (Activity Engine)
//  จ่ายด้วยแต้มสะสม · รางวัล = คูปองส่วนลด · สุ่มถ่วงน้ำหนักฝั่ง server
//  atomic ทั้งหมดใน transaction (หักแต้ม + ตัดสต็อก + บันทึกคูปอง)
// ============================================================
function genCouponCode() {
  return "LD-" + crypto.randomBytes(4).toString("hex").toUpperCase();
}
exports.spinLuckyDraw = onCall(async (req) => {
  const uid = req.auth && req.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "ต้อง login ก่อน");
  const tid = await resolveTid(req.data && req.data.tid);
  const drawId = ((req.data && req.data.drawId) || "").toString();
  if (!drawId) throw new HttpsError("invalid-argument", "ต้องระบุ drawId");

  const db = admin.firestore();
  const drawRef = troot(tid).collection("luckyDraws").doc(drawId);
  const userRef = troot(tid).collection("users").doc(uid);

  return db.runTransaction(async (tx) => {
    const [drawSnap, userSnap] = await Promise.all([tx.get(drawRef), tx.get(userRef)]);
    if (!drawSnap.exists) throw new HttpsError("not-found", "ไม่พบกิจกรรมนี้");
    if (!userSnap.exists) throw new HttpsError("not-found", "ไม่พบผู้ใช้");
    const draw = drawSnap.data();
    const user = userSnap.data();

    if (draw.active === false) throw new HttpsError("failed-precondition", "กิจกรรมนี้ปิดอยู่");
    const now = Date.now();
    const ms = (v) => (v && typeof v.toMillis === "function") ? v.toMillis() : null;
    if (ms(draw.startAt) && now < ms(draw.startAt)) throw new HttpsError("failed-precondition", "กิจกรรมยังไม่เริ่ม");
    if (ms(draw.endAt) && now > ms(draw.endAt)) throw new HttpsError("failed-precondition", "กิจกรรมสิ้นสุดแล้ว");

    const cost = Math.max(0, Math.floor(Number(draw.costPoints) || 0));
    const points = Math.floor(Number(user.points) || 0);
    if (points < cost) throw new HttpsError("failed-precondition", "แต้มไม่พอ (ต้องใช้ " + cost + " แต้ม)");

    // เตรียม pool: รางวัลที่ weight>0 และยังมีสต็อก (stock=null = ไม่จำกัด)
    const prizes = Array.isArray(draw.prizes) ? draw.prizes : [];
    const pool = prizes.map((p, i) => {
      const stock = (p.stock === null || p.stock === undefined) ? Infinity : Math.floor(Number(p.stock) || 0);
      const awarded = Math.floor(Number(p.awarded) || 0);
      return { i, p, weight: Math.max(0, Math.floor(Number(p.weight) || 0)), stock, awarded };
    }).filter((x) => x.weight > 0 && (x.stock === Infinity || x.awarded < x.stock));
    if (pool.length === 0) throw new HttpsError("failed-precondition", "รางวัลหมดแล้ว");

    // สุ่มถ่วงน้ำหนัก (crypto)
    const totalW = pool.reduce((s, x) => s + x.weight, 0);
    let r = crypto.randomInt(0, totalW);
    let chosen = pool[pool.length - 1];
    for (const x of pool) { if (r < x.weight) { chosen = x; break; } r -= x.weight; }
    const prize = chosen.p;
    const isWin = prize.type !== "nothing";

    // หักแต้ม + นับรอบหมุน
    tx.update(userRef, { points: FieldValue.increment(-cost) });
    if (chosen.stock !== Infinity) {
      const newPrizes = prizes.map((p, idx) => (idx === chosen.i)
        ? Object.assign({}, p, { awarded: (Math.floor(Number(p.awarded) || 0) + 1) }) : p);
      tx.update(drawRef, { prizes: newPrizes, spins: FieldValue.increment(1) });
    } else {
      tx.update(drawRef, { spins: FieldValue.increment(1) });
    }

    let couponOut = null;
    if (isWin) {
      const couponRef = userRef.collection("coupons").doc();
      const dType = (prize.discountType === "percent" || prize.discountType === "fixed") ? prize.discountType : null;
      const dVal = Math.max(0, Math.floor(Number(prize.discountValue) || 0));
      const coupon = {
        drawId: drawId,
        drawName: draw.name || "",
        prizeLabel: prize.label || "รางวัล",
        code: prize.couponCode || genCouponCode(),
        discountText: prize.discountText || "",
        discountType: dType,          // 'fixed' (บาท) | 'percent' (%) | null (แสดงอย่างเดียว ใช้ตอน checkout ไม่ได้)
        discountValue: dVal,          // ตัวเลขส่วนลด
        used: false,
        at: FieldValue.serverTimestamp(),
      };
      tx.set(couponRef, coupon);
      couponOut = { id: couponRef.id, label: coupon.prizeLabel, code: coupon.code, discountText: coupon.discountText, discountType: dType, discountValue: dVal };
    }

    return {
      win: isWin,
      prizeLabel: prize.label || (isWin ? "รางวัล" : "ยังไม่ถูกรอบนี้"),
      coupon: couponOut,
      costPoints: cost,
      pointsLeft: Math.max(0, points - cost),
    };
  });
});

// ============================================================
//  placeOrder — สร้างออเดอร์ทุกใบ server-side (ตัดสต็อก + คูปอง atomic)
//  server เท่านั้นที่มาร์คคูปอง used + ตัดสต็อก (rules ห้าม client เขียน) → กันขายเกิน/ใช้คูปองซ้ำ
// ============================================================
function couponDiscountAmount(coupon, base) {
  const val = Math.max(0, Math.floor(Number(coupon.discountValue) || 0));
  const b = Math.max(0, Math.floor(Number(base) || 0));
  if (coupon.discountType === "fixed") return Math.min(val, b);
  if (coupon.discountType === "percent") return Math.min(b, Math.floor(b * Math.min(val, 100) / 100));
  return 0;
}
// คิดค่าจัดส่งจากการตั้งค่าร้าน (settings/commerce) — โหมด free/flat/weight + ส่งฟรีเมื่อซื้อครบ
function computeShipping(cfg, weightKg, subtotal) {
  cfg = cfg || {};
  if (cfg.shipMode === "free") return 0;
  const freeMin = Math.max(0, Math.floor(Number(cfg.freeOverMin) || 0));
  if (cfg.freeOver === true && freeMin > 0 && subtotal >= freeMin) return 0;
  if (cfg.shipMode === "weight") {
    const base = Math.max(0, Math.floor(Number(cfg.weightBase) || 0));
    const per = Math.max(0, Math.floor(Number(cfg.weightPerKg) || 0));
    const extra = Math.max(0, Math.ceil(Number(weightKg) || 0) - 1);
    return base + extra * per;
  }
  return Math.max(0, Math.floor(Number(cfg.flatFee) || 0));   // flat (ค่าเริ่มต้น)
}

// ส่วนลดตาม tier (mirror config.js tiers[].discount) — server เป็นเจ้าของค่า ไม่เชื่อ client
const TIER_DISCOUNT = { bronze: 0, silver: 5, gold: 10, platinum: 15 };
// B2 step3: เพดานออเดอร์ที่ยังไม่ชำระ/รอตรวจ (pending_payment+paid_review) ต่อผู้ใช้
// กัน spam สร้างออเดอร์เพื่อ hold สต็อก (DoS). นับด้วย openOrders บน user doc
const MAX_OPEN_ORDERS = 5;

// สร้างออเดอร์ทุกกรณีผ่านฟังก์ชันนี้ (server-authoritative):
//  - ตรวจสินค้า active + สต็อกพอ · คิด subtotal จากราคาจริงใน DB (ไม่เชื่อ client)
//  - ตัดสต็อก + เพิ่ม soldCount · ใช้คูปอง (ถ้ามี) มาร์ค used · ทั้งหมด atomic
exports.placeOrder = onCall(async (req) => {
  const uid = req.auth && req.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "ต้อง login ก่อน");
  const tid = await resolveTid(req.data && req.data.tid);
  const cli = (req.data && req.data.order) || {};
  const couponId = ((req.data && req.data.couponId) || "").toString();  // optional

  const rawItems = Array.isArray(cli.items) ? cli.items : [];
  if (rawItems.length === 0) throw new HttpsError("invalid-argument", "ตะกร้าว่าง");

  // รวมจำนวนตาม product id (กันซ้ำ)
  const qtyById = {};
  rawItems.forEach((it) => {
    const id = ((it && it.id) || "").toString();
    const q = Math.max(1, Math.floor(Number(it && it.qty) || 1));
    if (id) qtyById[id] = (qtyById[id] || 0) + q;
  });
  const ids = Object.keys(qtyById);
  if (ids.length === 0) throw new HttpsError("invalid-argument", "สินค้าไม่ถูกต้อง");

  // NOTE (A1): ไม่ใช้ cli.discountPct อีกต่อไป — ส่วนลด tier คิดฝั่ง server จาก tier
  //            จริงของผู้ซื้อ (ดูใน transaction) เพื่อกันการยิง discountPct:90 เอาส่วนลดเอง

  const db = admin.firestore();
  const prodRefs = ids.map((id) => troot(tid).collection("products").doc(id));
  const couponRef = couponId ? troot(tid).collection("users").doc(uid).collection("coupons").doc(couponId) : null;
  const userRef = troot(tid).collection("users").doc(uid);
  const orderRef = troot(tid).collection("orders").doc();

  // อ่านการตั้งค่าค่าจัดส่ง (นอก transaction — config เปลี่ยนน้อย) · ถ้าไม่มี doc = เชื่อค่าส่งจาก client (legacy config.js)
  const commSnap = await troot(tid).collection("settings").doc("commerce").get();
  const commCfg = commSnap.exists ? commSnap.data() : null;
  const ptsCfg = await getPts(tid);   // threshold tier ต่อ tenant (ใช้คำนวณ tier จากแต้มจริง)

  return db.runTransaction(async (tx) => {
    // อ่านทั้งหมดก่อน (transaction ต้อง read ก่อน write)
    const prodSnaps = await Promise.all(prodRefs.map((r) => tx.get(r)));
    const couponSnap = couponRef ? await tx.get(couponRef) : null;
    const userSnap = await tx.get(userRef);   // อ่าน tier/แต้มจริงของผู้ซื้อ (server-authoritative discount)
    // A6: ต้องเป็นสมาชิกร้านนี้ (มี user doc ใต้ tenant นี้) — กันสั่งข้าม tenant / กัน non-member
    //     ยิง placeOrder ตัดสต็อกร้านอื่น (DoS). ตรงตาม pattern spin/mission/dailyBonus
    if (!userSnap.exists) throw new HttpsError("permission-denied", "ต้องเป็นสมาชิกร้านนี้ก่อนสั่งซื้อ");
    // B2 step3: กันสร้างออเดอร์ค้างชำระเกินเพดาน (hold สต็อก / DoS)
    if (Math.floor(Number(userSnap.data().openOrders) || 0) >= MAX_OPEN_ORDERS) {
      throw new HttpsError("resource-exhausted", "มีออเดอร์ที่ยังไม่ชำระ/รอตรวจสอบมากเกินไป กรุณาชำระหรือรอตรวจสอบก่อนสั่งใหม่");
    }

    let subtotal = 0, weight = 0;
    const items = [];
    const stockUpdates = [];
    prodSnaps.forEach((snap, i) => {
      const id = ids[i];
      if (!snap.exists) throw new HttpsError("not-found", "ไม่พบสินค้าบางรายการ");
      const p = snap.data();
      const nm = p.name || "สินค้า";
      if (p.active === false) throw new HttpsError("failed-precondition", '"' + nm + '" ปิดขายอยู่');
      const qty = qtyById[id];
      const tracked = !(p.stock === null || p.stock === undefined);
      if (tracked) {
        const stock = Math.max(0, Math.floor(Number(p.stock) || 0));
        if (stock < qty) {
          throw new HttpsError("failed-precondition", stock === 0 ? ('"' + nm + '" สินค้าหมด') : ('"' + nm + '" เหลือ ' + stock + ' ชิ้น (สั่ง ' + qty + ')'));
        }
      }
      const price = Math.max(0, Math.round(Number(p.price) || 0));
      const wkg = Number(p.weightKg) || 1;
      subtotal += price * qty;
      weight += wkg * qty;
      items.push({ id: id, name: nm, price: price, qty: qty, weightKg: wkg, category: p.category || "", image: p.image || "" });
      stockUpdates.push({ ref: prodRefs[i], tracked: tracked, qty: qty });
    });

    // ค่าจัดส่ง: มี settings/commerce → คิดฝั่ง server · ไม่มี → เชื่อ client (legacy)
    const shippingFee = commCfg ? computeShipping(commCfg, weight, subtotal) : Math.max(0, Math.floor(Number(cli.shippingFee) || 0));

    // ── ส่วนลดตาม tier: คิดฝั่ง server จากแต้มจริงของผู้ซื้อ (ไม่เชื่อ client) ──
    // เปิดใช้เมื่อร้านตั้ง settings/commerce.useTierDiscount === true เท่านั้น
    let tierPct = 0;
    if (commCfg && commCfg.useTierDiscount === true) {
      const userPts = userSnap.exists ? Math.max(0, Math.floor(Number(userSnap.data().points) || 0)) : 0;
      const tierKey = calcTier(userPts, ptsCfg.tiers);
      tierPct = Math.min(90, Math.max(0, Math.floor(Number(TIER_DISCOUNT[tierKey]) || 0)));
    }
    const tierDiscount = Math.floor(subtotal * tierPct / 100);
    const base = Math.max(0, subtotal - tierDiscount);   // คูปองลดจากยอดหลังส่วนลดสมาชิก (ไม่ลดค่าส่ง)

    let couponDiscount = 0, couponCode = "", couponLabel = "";
    if (couponRef) {
      if (!couponSnap.exists) throw new HttpsError("not-found", "ไม่พบคูปอง");
      const coupon = couponSnap.data();
      if (coupon.used === true) throw new HttpsError("failed-precondition", "คูปองนี้ถูกใช้ไปแล้ว");
      if (coupon.discountType !== "fixed" && coupon.discountType !== "percent") {
        throw new HttpsError("failed-precondition", "คูปองนี้ใช้ลดราคาไม่ได้");
      }
      couponDiscount = couponDiscountAmount(coupon, base);
      couponCode = coupon.code || "";
      couponLabel = coupon.prizeLabel || "";
    }

    const total = Math.max(0, base - couponDiscount + shippingFee);

    const order = {
      tenantId: tid,
      userId: uid,
      userName: (cli.userName || "").toString(),
      items: items,
      subtotal: subtotal,
      discountPct: tierPct,
      discount: tierDiscount,
      couponId: couponId || null,
      couponCode: couponCode,
      couponLabel: couponLabel,
      couponDiscount: couponDiscount,
      shippingFee: shippingFee,
      weight: weight,
      total: total,
      shipping: cli.shipping || {},
      status: "pending_payment",
      paymentMethod: "promptpay",
      promptpayAmount: total,
      stockApplied: true,     // ตัดสต็อกแล้ว (ให้ adminCancelOrder รู้ว่าต้องคืนสต็อกตอนยกเลิก)
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    tx.set(orderRef, order);
    tx.update(userRef, { openOrders: FieldValue.increment(1) });   // B2 step3: นับออเดอร์ค้างชำระ
    stockUpdates.forEach((s) => {
      const upd = { soldCount: FieldValue.increment(s.qty) };
      if (s.tracked) upd.stock = FieldValue.increment(-s.qty);
      tx.update(s.ref, upd);
    });
    if (couponRef) tx.update(couponRef, { used: true, usedAt: FieldValue.serverTimestamp(), orderId: orderRef.id });

    return { orderId: orderRef.id, total: total, subtotal: subtotal, discount: tierDiscount, shippingFee: shippingFee, couponDiscount: couponDiscount, couponCode: couponCode };
  });
});

// ============================================================
//  adminCancelOrder — แอดมินยกเลิกออเดอร์ + คืนสต็อก (atomic, idempotent)
//  คืนสต็อกเฉพาะออเดอร์ที่ stockApplied และยังไม่เคยคืน (restocked!=true)
// ============================================================
exports.adminCancelOrder = onCall(async (req) => {
  const uid = req.auth && req.auth.uid;
  const token = (req.auth && req.auth.token) || {};
  const tid = await resolveTid(req.data && req.data.tid);
  const isAdmin = token.admin === true || (token.tadmin && token.tadmin[tid] === true);
  if (!uid || !isAdmin) throw new HttpsError("permission-denied", "เฉพาะแอดมินเท่านั้น");
  const orderId = ((req.data && req.data.orderId) || "").toString();
  if (!orderId) throw new HttpsError("invalid-argument", "ต้องระบุ orderId");

  const db = admin.firestore();
  const orderRef = troot(tid).collection("orders").doc(orderId);

  return db.runTransaction(async (tx) => {
    const oSnap = await tx.get(orderRef);
    if (!oSnap.exists) throw new HttpsError("not-found", "ไม่พบออเดอร์");
    const o = oSnap.data();
    if (o.status === "cancelled") return { ok: true, alreadyCancelled: true, restocked: false };
    if (o.status === "completed") throw new HttpsError("failed-precondition", "ออเดอร์ปิดสำเร็จแล้ว ยกเลิกไม่ได้");

    // คืนสต็อกเฉพาะออเดอร์ที่ตัดสต็อกไว้จริง และยังไม่เคยคืน
    const doRestock = o.stockApplied === true && o.restocked !== true;
    let restockRefs = [];
    if (doRestock) {
      const items = Array.isArray(o.items) ? o.items : [];
      const agg = {};
      items.forEach((it) => {
        const id = ((it && it.id) || "").toString();
        const q = Math.max(0, Math.floor(Number(it && it.qty) || 0));
        if (id && q) agg[id] = (agg[id] || 0) + q;
      });
      const ids = Object.keys(agg);
      const refs = ids.map((id) => troot(tid).collection("products").doc(id));
      const snaps = await Promise.all(refs.map((r) => tx.get(r)));   // อ่านสินค้าก่อนเขียน
      snaps.forEach((s, i) => { if (s.exists) restockRefs.push({ ref: refs[i], qty: agg[ids[i]], tracked: !(s.data().stock === null || s.data().stock === undefined) }); });
    }

    // B2 step3: ถ้ายกเลิกออเดอร์ที่ยัง "ค้างชำระ" (pending_payment/paid_review) → ลด openOrders
    // ของเจ้าของ (ออเดอร์ที่ confirmed แล้วถูกลดตอน confirm ไปแล้ว จึงไม่ลดซ้ำ)
    const wasOpen = o.status === "pending_payment" || o.status === "paid_review";
    let ownerRef = null, ownerOpen = 0, ownerExists = false;
    if (wasOpen && o.userId) {
      ownerRef = troot(tid).collection("users").doc(o.userId);
      const us = await tx.get(ownerRef);   // อ่านก่อน write
      ownerExists = us.exists; ownerOpen = us.exists ? (Number(us.data().openOrders) || 0) : 0;
    }

    tx.update(orderRef, {
      status: "cancelled",
      cancelledAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      restocked: doRestock ? true : (o.restocked === true),
    });
    restockRefs.forEach((r) => {
      const upd = { soldCount: FieldValue.increment(-r.qty) };
      if (r.tracked) upd.stock = FieldValue.increment(r.qty);
      tx.update(r.ref, upd);
    });
    if (ownerRef && ownerExists) tx.update(ownerRef, { openOrders: Math.max(0, Math.floor(ownerOpen) - 1) });

    return { ok: true, restocked: doRestock, items: restockRefs.length };
  });
});

// ============================================================
//  B2: order state machine — setOrderStatus (แอดมิน) เปลี่ยนสถานะผ่าน callable
//  บังคับ transition ชุดเดียว (แทน admin เขียน status ตรง). ยกเลิก = adminCancelOrder
//  (ต้องคืนสต็อก), auto-ship = createShipment; ที่นี่คุม confirm / ship(manual) / complete
// ============================================================
const ORDER_TRANSITIONS = {
  pending_payment: ["paid_review", "confirmed", "cancelled"],
  paid_review:     ["confirmed", "cancelled"],
  confirmed:       ["shipped", "cancelled"],
  shipped:         ["completed", "cancelled"],
  completed:       [],
  cancelled:       [],
};
const ORDER_STATUS_TS = { paid_review: "paidAt", confirmed: "confirmedAt", shipped: "shippedAt", completed: "completedAt" };
exports._orderCanTransition = (from, to) => (ORDER_TRANSITIONS[from] || []).includes(to);  // unit test

exports.setOrderStatus = onCall(async (req) => {
  const uid = req.auth && req.auth.uid;
  const token = (req.auth && req.auth.token) || {};
  const tid = await resolveTid(req.data && req.data.tid);
  const isAdmin = token.admin === true || (token.tadmin && token.tadmin[tid] === true);
  if (!uid || !isAdmin) throw new HttpsError("permission-denied", "เฉพาะแอดมินเท่านั้น");
  const orderId = ((req.data && req.data.orderId) || "").toString();
  const to = ((req.data && req.data.to) || "").toString();
  if (!orderId) throw new HttpsError("invalid-argument", "ต้องระบุ orderId");
  if (to === "cancelled") throw new HttpsError("failed-precondition", "ยกเลิกออเดอร์ผ่าน adminCancelOrder (ต้องคืนสต็อก)");
  if (!ORDER_STATUS_TS[to]) throw new HttpsError("invalid-argument", "สถานะปลายทางไม่ถูกต้อง");
  const trackingNumber = req.data && req.data.trackingNumber;
  const orderRef = troot(tid).collection("orders").doc(orderId);
  return admin.firestore().runTransaction(async (tx) => {
    const s = await tx.get(orderRef);
    if (!s.exists) throw new HttpsError("not-found", "ไม่พบออเดอร์");
    const from = s.data().status || "pending_payment";
    if (!(ORDER_TRANSITIONS[from] || []).includes(to)) {
      throw new HttpsError("failed-precondition", "เปลี่ยนสถานะจาก " + from + " → " + to + " ไม่ได้");
    }
    // B2 step3: →confirmed = ออกจากชุดค้างชำระ → ลด openOrders ของเจ้าของ (อ่านก่อน write)
    const ownerId = to === "confirmed" ? (s.data().userId || "") : "";
    const ownerRef = ownerId ? troot(tid).collection("users").doc(ownerId) : null;
    const ownerSnap = ownerRef ? await tx.get(ownerRef) : null;
    const upd = { status: to, updatedAt: FieldValue.serverTimestamp(), [ORDER_STATUS_TS[to]]: FieldValue.serverTimestamp() };
    if (to === "shipped" && typeof trackingNumber === "string" && trackingNumber.trim()) upd.trackingNumber = trackingNumber.trim();
    tx.update(orderRef, upd);
    if (ownerRef && ownerSnap.exists) {
      tx.update(ownerRef, { openOrders: Math.max(0, Math.floor(Number(ownerSnap.data().openOrders) || 0) - 1) });
    }
    return { ok: true, from: from, to: to };
  });
});

// ============================================================
//  claimMission — รับรางวัลภารกิจ (Phase 4) · server ตรวจ progress เอง
//  progress ดึงจากตัวนับที่มีอยู่: points / postCount / จำนวนออเดอร์ที่จ่ายแล้ว
//  รางวัล = แต้ม หรือ คูปอง · กันรับซ้ำด้วย missionClaims/{missionId}
// ============================================================
exports.claimMission = onCall(async (req) => {
  const uid = req.auth && req.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "ต้อง login ก่อน");
  const tid = await resolveTid(req.data && req.data.tid);
  const missionId = ((req.data && req.data.missionId) || "").toString();
  if (!missionId) throw new HttpsError("invalid-argument", "ต้องระบุ missionId");

  const db = admin.firestore();
  const mRef = troot(tid).collection("missions").doc(missionId);
  const uRef = troot(tid).collection("users").doc(uid);
  const claimRef = uRef.collection("missionClaims").doc(missionId);

  // ภารกิจแบบ 'purchases' ต้องนับออเดอร์ที่จ่ายแล้ว (อ่านนอก transaction)
  const m0 = await mRef.get();
  if (!m0.exists) throw new HttpsError("not-found", "ไม่พบภารกิจนี้");
  let purchaseCount = 0;
  if (m0.data().type === "purchases") {
    const paid = ["paid_review", "confirmed", "shipped", "completed"];
    const oSnap = await troot(tid).collection("orders").where("userId", "==", uid).get();
    purchaseCount = oSnap.docs.filter((d) => paid.indexOf((d.data() || {}).status) > -1).length;
  }

  return db.runTransaction(async (tx) => {
    const [mSnap, uSnap, cSnap] = await Promise.all([tx.get(mRef), tx.get(uRef), tx.get(claimRef)]);
    if (!mSnap.exists) throw new HttpsError("not-found", "ไม่พบภารกิจนี้");
    if (!uSnap.exists) throw new HttpsError("not-found", "ไม่พบผู้ใช้");
    const m = mSnap.data(), u = uSnap.data();
    if (m.active === false) throw new HttpsError("failed-precondition", "ภารกิจนี้ปิดอยู่");
    const now = Date.now();
    const ms = (v) => (v && typeof v.toMillis === "function") ? v.toMillis() : null;
    if (ms(m.startAt) && now < ms(m.startAt)) throw new HttpsError("failed-precondition", "ภารกิจยังไม่เริ่ม");
    if (ms(m.endAt) && now > ms(m.endAt)) throw new HttpsError("failed-precondition", "ภารกิจสิ้นสุดแล้ว");
    if (cSnap.exists) throw new HttpsError("failed-precondition", "รับรางวัลภารกิจนี้ไปแล้ว");

    const goal = Math.max(1, Math.floor(Number(m.goal) || 1));
    let progress = 0;
    if (m.type === "points") progress = Math.floor(Number(u.points) || 0);
    else if (m.type === "posts") progress = Math.floor(Number(u.postCount) || 0);
    else if (m.type === "purchases") progress = purchaseCount;
    else throw new HttpsError("failed-precondition", "ประเภทภารกิจไม่รองรับ");
    if (progress < goal) throw new HttpsError("failed-precondition", "ยังทำภารกิจไม่ครบ (" + progress + "/" + goal + ")");

    const claim = { missionId: missionId, name: m.name || "", at: FieldValue.serverTimestamp() };
    let reward;
    if (m.rewardType === "coupon" && m.coupon) {
      const c = m.coupon;
      const couponRef = uRef.collection("coupons").doc();
      const coupon = {
        drawId: "mission:" + missionId, drawName: m.name || "",
        prizeLabel: c.label || m.name || "คูปอง",
        code: c.code || genCouponCode(),
        discountText: c.discountText || "",
        discountType: (c.discountType === "percent" || c.discountType === "fixed") ? c.discountType : null,
        discountValue: Math.max(0, Math.floor(Number(c.discountValue) || 0)),
        used: false, at: FieldValue.serverTimestamp(),
      };
      tx.set(couponRef, coupon);
      claim.rewardType = "coupon";
      reward = { type: "coupon", coupon: { code: coupon.code, label: coupon.prizeLabel } };
    } else {
      const pts = Math.max(0, Math.floor(Number(m.rewardPoints) || 0));
      if (pts > 0) tx.update(uRef, { points: FieldValue.increment(pts) });
      claim.rewardType = "points"; claim.rewardPoints = pts;
      reward = { type: "points", points: pts };
    }
    tx.set(claimRef, claim);
    tx.update(mRef, { claimCount: FieldValue.increment(1) });   // analytics counter — idempotent (มาถึงนี่ได้ครั้งเดียวต่อ user เพราะ guard cSnap.exists)
    return { ok: true, reward: reward, progress: progress, goal: goal };
  });
});

// ============================================================
//  ทายผล (Prediction) — submitPrediction + settlePrediction
//  ผู้ใช้ส่งคำทาย (ครั้งเดียว, ก่อนปิดรับ, หักค่าเข้าร่วมถ้ามี)
//  แอดมินเฉลย → จ่ายรางวัลให้ผู้ชนะทุกคนอัตโนมัติ (idempotent)
// ============================================================
exports.submitPrediction = onCall(async (req) => {
  const uid = req.auth && req.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "ต้อง login ก่อน");
  const tid = await resolveTid(req.data && req.data.tid);
  const eventId = ((req.data && req.data.eventId) || "").toString();
  const answer = ((req.data && req.data.answer) || "").toString().trim();
  if (!eventId) throw new HttpsError("invalid-argument", "ต้องระบุ eventId");
  if (!answer) throw new HttpsError("invalid-argument", "ต้องเลือก/กรอกคำทาย");

  const db = admin.firestore();
  const pRef = troot(tid).collection("predictions").doc(eventId);
  const uRef = troot(tid).collection("users").doc(uid);
  const eRef = pRef.collection("entries").doc();               // แต่ละครั้ง = เอกสารใหม่ (auto-id)
  const cntRef = pRef.collection("userCounts").doc(uid);       // ตัวนับจำนวนครั้งของ user

  return db.runTransaction(async (tx) => {
    const [pSnap, uSnap, cntSnap] = await Promise.all([tx.get(pRef), tx.get(uRef), tx.get(cntRef)]);
    if (!pSnap.exists) throw new HttpsError("not-found", "ไม่พบกิจกรรมทายผล");
    if (!uSnap.exists) throw new HttpsError("not-found", "ไม่พบผู้ใช้");
    const p = pSnap.data(), u = uSnap.data();
    if (p.active === false || p.status !== "open") throw new HttpsError("failed-precondition", "ปิดรับคำทายแล้ว");
    const now = Date.now();
    const closeMs = (p.closeAt && typeof p.closeAt.toMillis === "function") ? p.closeAt.toMillis() : null;
    if (closeMs && now > closeMs) throw new HttpsError("failed-precondition", "หมดเวลาทายแล้ว");
    // ตรวจคำทาย: โหมด choice ต้องอยู่ในตัวเลือก
    if (p.mode === "choice") {
      const opts = Array.isArray(p.options) ? p.options.map((x) => String(x)) : [];
      if (opts.indexOf(answer) < 0) throw new HttpsError("invalid-argument", "ตัวเลือกไม่ถูกต้อง");
    }
    // จำนวนครั้งที่เล่นได้: maxEntries=1 ครั้งเดียว · >1 จำกัด N ครั้ง · 0 = ไม่จำกัด (จนแต้มหมดถ้ามีค่าเข้าร่วม)
    const maxEntries = (p.maxEntries === undefined || p.maxEntries === null) ? 1 : Math.max(0, Math.floor(Number(p.maxEntries) || 0));
    const played = cntSnap.exists ? Math.floor(Number(cntSnap.data().count) || 0) : 0;
    if (maxEntries > 0 && played >= maxEntries) {
      throw new HttpsError("failed-precondition", maxEntries === 1 ? "คุณทายกิจกรรมนี้ไปแล้ว" : ("เล่นครบ " + maxEntries + " ครั้งแล้ว"));
    }

    const cost = Math.max(0, Math.floor(Number(p.costPoints) || 0));
    if (cost > 0) {
      const points = Math.floor(Number(u.points) || 0);
      if (points < cost) throw new HttpsError("failed-precondition", "แต้มไม่พอ (ใช้ " + cost + " แต้ม)");
      tx.update(uRef, { points: FieldValue.increment(-cost) });
    }
    tx.set(eRef, { uid: uid, answer: answer, won: false, rewarded: false, at: FieldValue.serverTimestamp() });
    tx.set(cntRef, { uid: uid, count: FieldValue.increment(1) }, { merge: true });
    tx.update(pRef, { entriesCount: FieldValue.increment(1) });
    return { ok: true, answer: answer, costPoints: cost, played: played + 1, maxEntries: maxEntries };
  });
});

exports.settlePrediction = onCall(async (req) => {
  const uid = req.auth && req.auth.uid;
  const token = (req.auth && req.auth.token) || {};
  const tid = await resolveTid(req.data && req.data.tid);
  const isAdmin = token.admin === true || (token.tadmin && token.tadmin[tid] === true);
  if (!uid || !isAdmin) throw new HttpsError("permission-denied", "เฉพาะแอดมินเท่านั้น");
  const eventId = ((req.data && req.data.eventId) || "").toString();
  const inAnswer = ((req.data && req.data.correctAnswer) || "").toString().trim();
  if (!eventId) throw new HttpsError("invalid-argument", "ต้องระบุ eventId");

  const db = admin.firestore();
  const pRef = troot(tid).collection("predictions").doc(eventId);

  // 1) ล็อกผลเฉลย (idempotent) — ครั้งแรกตั้ง correctAnswer, ครั้งถัดไปใช้ค่าเดิม
  const p = await db.runTransaction(async (tx) => {
    const s = await tx.get(pRef);
    if (!s.exists) throw new HttpsError("not-found", "ไม่พบกิจกรรมทายผล");
    const d = s.data();
    if (d.status !== "settled") {
      if (!inAnswer) throw new HttpsError("invalid-argument", "ต้องระบุผลที่ถูกต้อง");
      tx.update(pRef, { status: "settled", correctAnswer: inAnswer, settledAt: FieldValue.serverTimestamp() });
      d.correctAnswer = inAnswer;
    }
    return d;
  });
  const correct = p.correctAnswer;

  // 2) จ่ายรางวัลผู้ชนะที่ยังไม่ได้รับ (batched, idempotent ด้วย entry.rewarded)
  const entriesSnap = await pRef.collection("entries").get();
  const winners = entriesSnap.docs.filter((d) => String((d.data() || {}).answer) === String(correct));
  const rewardType = p.rewardType === "coupon" ? "coupon" : "points";
  const rewardPoints = Math.max(0, Math.floor(Number(p.rewardPoints) || 0));
  const c = p.coupon || {};

  let granted = 0;
  for (let i = 0; i < winners.length; i += 200) {
    const chunk = winners.slice(i, i + 200);
    const batch = db.batch();
    let ops = 0;
    chunk.forEach((d) => {
      const e = d.data() || {};
      if (e.rewarded === true) { batch.update(d.ref, { won: true }); ops++; return; }
      const wUid = e.uid || d.id;
      const uRef = troot(tid).collection("users").doc(wUid);
      if (rewardType === "coupon") {
        const couponRef = uRef.collection("coupons").doc();
        batch.set(couponRef, {
          drawId: "prediction:" + eventId, drawName: p.name || "",
          prizeLabel: c.label || p.name || "คูปอง", code: c.code || genCouponCode(),
          discountText: c.discountText || "",
          discountType: (c.discountType === "percent" || c.discountType === "fixed") ? c.discountType : null,
          discountValue: Math.max(0, Math.floor(Number(c.discountValue) || 0)),
          used: false, at: FieldValue.serverTimestamp(),
        });
      } else if (rewardPoints > 0) {
        batch.update(uRef, { points: FieldValue.increment(rewardPoints) });
      }
      batch.update(d.ref, { won: true, rewarded: true });
      granted++;
    });
    if (ops > 0 || granted > 0) await batch.commit();
  }

  await pRef.update({ winnersCount: winners.length });
  return { ok: true, correctAnswer: correct, winners: winners.length, granted: granted };
});

// ============================================================
//  ขนส่ง (Courier integration) — โครงเตรียมไว้เสียบ API จริงทีหลัง
//  setCourierCredential: เก็บ API key ไว้ใน private/courier (client อ่านไม่ได้)
//  createShipment: สร้างเลขพัสดุ (มี mock mode ให้เทสต์ · จุดเสียบ API จริงมี TODO)
// ============================================================
function requireAdmin(req, tid) {
  const uid = req.auth && req.auth.uid;
  const token = (req.auth && req.auth.token) || {};
  const isAdmin = token.admin === true || (token.tadmin && token.tadmin[tid] === true);
  if (!uid || !isAdmin) throw new HttpsError("permission-denied", "เฉพาะแอดมินเท่านั้น");
  return uid;
}

exports.setCourierCredential = onCall(async (req) => {
  const tid = await resolveTid(req.data && req.data.tid);
  requireAdmin(req, tid);
  const provider = ((req.data && req.data.provider) || "").toString();
  const apiKey = ((req.data && req.data.apiKey) || "").toString();
  const apiSecret = ((req.data && req.data.apiSecret) || "").toString();
  if (!provider) throw new HttpsError("invalid-argument", "ต้องระบุ provider");
  // เก็บ secret ในที่ client อ่านไม่ได้ (rules: private/* read,write=false → เข้าถึงผ่าน admin SDK เท่านั้น)
  await troot(tid).collection("private").doc("courier").set({
    provider: provider, apiKey: apiKey, apiSecret: apiSecret,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { ok: true, hasKey: apiKey.length > 0 };
});

// preflight: เช็กว่ามีข้อมูลครบพอสร้างพัสดุจริง (provider-agnostic) — คืน list ที่ขาด (ว่าง=ครบ)
function isPostcode(v) { return /^\d{5}$/.test(String(v || "").trim()); }
function shipmentPreflight(order, store) {
  const miss = [];
  const s = (order && order.shipping) || {};
  if (!s.name)        miss.push("ชื่อผู้รับ");
  if (!s.phone)       miss.push("เบอร์ผู้รับ");
  if (!s.addressLine) miss.push("ที่อยู่ผู้รับ");
  if (!s.subdistrict) miss.push("ตำบล/แขวงผู้รับ");
  if (!s.district)    miss.push("อำเภอ/เขตผู้รับ");
  if (!s.province)    miss.push("จังหวัดผู้รับ");
  if (!isPostcode(s.postcode)) miss.push("รหัสไปรษณีย์ผู้รับ (5 หลัก)");
  const st = store || {};
  if (!st.name)        miss.push("ชื่อร้าน (ผู้ส่ง)");
  if (!st.phone)       miss.push("เบอร์ร้าน (ผู้ส่ง)");
  if (!st.addressLine) miss.push("ที่อยู่ร้าน (ผู้ส่ง)");
  if (!st.subdistrict) miss.push("ตำบล/แขวงร้าน");
  if (!st.district)    miss.push("อำเภอ/เขตร้าน");
  if (!st.province)    miss.push("จังหวัดร้าน");
  if (!isPostcode(st.postcode)) miss.push("รหัสไปรษณีย์ร้าน (5 หลัก)");
  if (!(Number(order && order.weight) > 0)) miss.push("น้ำหนักพัสดุ (ตั้งน้ำหนักสินค้าในระบบ)");
  return miss;
}
exports._shipmentPreflight = shipmentPreflight;   // export ไว้เผื่อ unit test

// ── Shippop (marketplace / mkpservice) — สร้างพัสดุจริง ──────────────
//  getprice ไม่เปิดใน mkpservice → ใช้ booking(force_confirm:0) แล้ว confirm
//  Address: Shippop.district = ตำบล/แขวง (ของเรา=subdistrict), Shippop.state = อำเภอ/เขต (ของเรา=district)
//  Parcel.weight หน่วยเป็น "กรัม"; courier_tracking_code จะได้หลัง confirm
async function shippopCreateShipment({ baseUrl, apiKey, email, from, to, parcel, courierCode, codAmount, product }) {
  const B = (baseUrl || "https://mkpservice.shippop.dev").replace(/\/+$/, "");
  const item = { from: from, to: to, parcel: parcel, courier_code: courierCode };
  if (codAmount > 0) item.cod_amount = Math.round(codAmount);
  if (product && Object.keys(product).length) item.product = product;   // Shippop บังคับมี product เมื่อเป็น COD

  // 1) booking — จองก่อน (ยังไม่ commit)
  const bRes = await fetch(B + "/booking/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey, email: email || "noreply@bocean.app", force_confirm: 0, data: [ item ] }),
  });
  const bText = await bRes.text();
  let bJson;
  try { bJson = JSON.parse(bText); }
  catch (e) { throw new HttpsError("internal", "Shippop booking ตอบกลับไม่ใช่ JSON (ตรวจ baseUrl/สิทธิ์การใช้งาน)"); }
  if (bJson.status !== true) {
    let reason = bJson.message || "";
    try {                                   // เหตุผลรายขนส่ง เช่น "Courier code not allow"
      const c = bJson.data && (bJson.data["0"] || bJson.data[0]);
      if (c) { const k = Object.keys(c)[0]; if (c[k] && c[k].remark) reason = courierCode + ": " + c[k].remark; }
    } catch (e) { /* ignore */ }
    throw new HttpsError("failed-precondition", "Shippop booking ไม่สำเร็จ — " + String(reason || JSON.stringify(bJson)).slice(0, 200));
  }
  const b0 = (bJson.data && (bJson.data["0"] || bJson.data[0])) || {};
  const purchaseId = bJson.purchase_id;
  const shippopCode = b0.tracking_code || "";
  const price = Number(b0.price || bJson.total_price || 0);

  // 2) confirm — commit (ส่งเข้าขนส่งจริง ยกเลิกไม่ได้) → ได้ courier_tracking_code
  const fd = new FormData();
  fd.append("api_key", apiKey);
  fd.append("purchase_id", String(purchaseId));
  const cRes = await fetch(B + "/confirm/", { method: "POST", body: fd });
  const cJson = await cRes.json().catch(() => null);
  if (!cJson || cJson.status !== true) {
    throw new HttpsError("failed-precondition", "Shippop confirm ไม่สำเร็จ (booking " + purchaseId + ") — " + String((cJson && cJson.message) || "unknown").slice(0, 160));
  }
  const r0 = (cJson.result && (cJson.result["0"] || cJson.result[0])) || {};
  if (r0.status !== true) {
    throw new HttpsError("failed-precondition", "Shippop confirm รายการไม่ผ่าน — " + String(r0.message || "").slice(0, 160));
  }
  return {
    trackingNumber: r0.courier_tracking_code || shippopCode,   // เลขที่ลูกค้าใช้ติดตามกับขนส่ง
    shippopCode: shippopCode,                                  // เลข SHIPPOP (เรียก label/status ภายหลัง)
    purchaseId: purchaseId,
    courierCode: r0.courier_code || courierCode,
    price: price,
  };
}

exports.createShipment = onCall(async (req) => {
  const tid = await resolveTid(req.data && req.data.tid);
  requireAdmin(req, tid);
  const orderId = ((req.data && req.data.orderId) || "").toString();
  const courier = ((req.data && req.data.courier) || "").toString();
  if (!orderId) throw new HttpsError("invalid-argument", "ต้องระบุ orderId");

  const orderRef = troot(tid).collection("orders").doc(orderId);
  const [oSnap, cfgSnap, secSnap, storeSnap] = await Promise.all([
    orderRef.get(),
    troot(tid).collection("settings").doc("courier").get(),
    troot(tid).collection("private").doc("courier").get(),
    troot(tid).collection("settings").doc("store").get(),
  ]);
  if (!oSnap.exists) throw new HttpsError("not-found", "ไม่พบออเดอร์");
  const order = oSnap.data();
  const store = storeSnap.exists ? storeSnap.data() : {};
  if (order.trackingNumber) throw new HttpsError("failed-precondition", "ออเดอร์นี้มีเลขพัสดุแล้ว");
  const cfg = cfgSnap.exists ? cfgSnap.data() : {};
  if (cfg.active !== true) throw new HttpsError("failed-precondition", "ยังไม่ได้เปิดใช้ระบบขนส่งอัตโนมัติ (ตั้งค่าในแอดมิน)");
  const sec = secSnap.exists ? secSnap.data() : {};
  const useMock = cfg.mock === true || !sec.apiKey;

  let trackingNumber, labelUrl = "";
  let courierUsed = courier || cfg.provider || "";
  const extra = {};   // ฟิลด์เพิ่มจาก provider จริง (shippopCode/purchaseId/price)
  if (useMock) {
    // โหมดทดสอบ: เลขพัสดุจำลอง — ให้ลอง flow ได้โดยยังไม่ต้องมี API จริง
    const suffix = (Date.now().toString(36) + Math.floor(order.total || 0).toString(36)).toUpperCase().slice(-8);
    trackingNumber = "MOCK-" + (courier || "TH").toUpperCase().slice(0, 3) + "-" + suffix;
  } else {
    // preflight: ข้อมูลต้องครบก่อนยิง API จริง (ไม่งั้นไปพังที่ฝั่ง provider)
    const miss = shipmentPreflight(order, store);
    if (miss.length) {
      throw new HttpsError("failed-precondition", "ข้อมูลไม่ครบสำหรับสร้างพัสดุ: " + miss.join(", "));
    }
    const provider = (cfg.provider || "shippop").toLowerCase();
    if (provider !== "shippop") {
      throw new HttpsError("unimplemented", "ยังรองรับเฉพาะ Shippop — provider ปัจจุบัน: " + provider);
    }
    // map ที่อยู่: Shippop.district = ตำบล/แขวง (ของเรา subdistrict), Shippop.state = อำเภอ/เขต (ของเรา district)
    const s = order.shipping || {};
    const from = { name: store.name, address: store.addressLine, district: store.subdistrict, state: store.district, province: store.province, postcode: String(store.postcode), tel: String(store.phone) };
    const to   = { name: s.name,     address: s.addressLine,     district: s.subdistrict,     state: s.district,     province: s.province,     postcode: String(s.postcode),     tel: String(s.phone) };
    const grams = Math.max(1, Math.round(Number(order.weight || 0) * 1000));   // order.weight เป็น กก. → กรัม
    const firstItem = (order.items && order.items[0] && order.items[0].name) || "สินค้า";
    const parcel = {
      name: firstItem, weight: grams,
      width:  Number(order.boxW || store.boxW || 20),
      length: Number(order.boxL || store.boxL || 20),
      height: Number(order.boxH || store.boxH || 10),
    };
    const courierCode = String(courier || cfg.defaultCourier || "FLE").toUpperCase();
    const codAmount = Number(order.codAmount || 0);   // 0 = พรีเพด (พร้อมเพย์)
    // product object — Shippop บังคับมีเมื่อ COD (map จาก order.items: {id,name,price,qty,weightKg,category})
    let product = null;
    if (codAmount > 0 && Array.isArray(order.items) && order.items.length) {
      product = {};
      order.items.forEach((it, i) => {
        product[String(i)] = {
          product_code: String(it.id || ("P" + i)),
          name: String(it.name || "สินค้า"),
          category: String(it.category || "-"),
          price: Number(it.price || 0),
          amount: Number(it.qty || 1),
          weight: Math.max(1, Math.round(Number(it.weightKg || 0) * 1000)) || 100,
        };
      });
    }
    const r = await shippopCreateShipment({
      baseUrl: cfg.baseUrl, apiKey: sec.apiKey, email: store.email || sec.email,
      from: from, to: to, parcel: parcel, courierCode: courierCode, codAmount: codAmount, product: product,
    });
    trackingNumber = r.trackingNumber;
    courierUsed = r.courierCode || courierCode;
    extra.shippopCode = r.shippopCode || "";
    extra.shippopPurchaseId = r.purchaseId || null;
    extra.shippingPrice = r.price || 0;
  }

  await orderRef.update(Object.assign({
    status: "shipped",
    courier: courierUsed,
    trackingNumber: trackingNumber,
    labelUrl: labelUrl,
    shippedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, extra));
  return { ok: true, trackingNumber: trackingNumber, labelUrl: labelUrl, mock: useMock, courier: courierUsed };
});

// ============================================================
//  บิลค่าส่งต่อแบรนด์ (super-admin / Bocean) — รวมต้นทุน Shippop ต่อแบรนด์/เดือน
//  ที่เชื่อมขนส่งคือ "ท่อ" (หักเครดิต Shippop ของ Bocean); ตรงนี้คือชั้น settlement
//  ที่ Bocean ใช้ออกบิลกับแบรนด์ + ทำเครื่องหมายชำระแล้ว
// ============================================================
function requireSuperAdmin(req) {
  const uid = req.auth && req.auth.uid;
  const token = (req.auth && req.auth.token) || {};
  if (!uid || token.admin !== true) throw new HttpsError("permission-denied", "เฉพาะผู้ดูแลระบบ Bocean เท่านั้น");
  return uid;
}

function monthRange(month) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(month || ""));
  const now = new Date();
  let y, mo;
  if (m) { y = +m[1]; mo = +m[2] - 1; } else { y = now.getUTCFullYear(); mo = now.getUTCMonth(); }
  const start = new Date(Date.UTC(y, mo, 1, 0, 0, 0));
  const end = new Date(Date.UTC(y, mo + 1, 1, 0, 0, 0));
  const label = y + "-" + String(mo + 1).padStart(2, "0");
  return { start: start, end: end, label: label };
}

exports.shippingBillingSummary = onCall(async (req) => {
  requireSuperAdmin(req);
  const { start, end, label } = monthRange(req.data && req.data.month);
  const fs = admin.firestore();
  const tenantsSnap = await fs.collection("tenants").get();
  const brands = [];
  let grandTotal = 0, grandCount = 0;
  for (const t of tenantsSnap.docs) {
    const tid = t.id;
    const tdata = t.data() || {};
    let os;
    try {
      os = await fs.collection("tenants").doc(tid).collection("orders")
        .where("shippedAt", ">=", start).where("shippedAt", "<", end).get();
    } catch (e) { continue; }
    const orders = [];
    let total = 0;
    os.forEach((d) => {
      const o = d.data() || {};
      const price = Number(o.shippingPrice || 0);
      if (!(price > 0)) return;   // เฉพาะพัสดุจริง (mock ไม่มี shippingPrice)
      total += price;
      const sa = (o.shippedAt && o.shippedAt.toDate) ? o.shippedAt.toDate().toISOString() : null;
      orders.push({
        orderId: d.id, price: price, courier: o.courier || "",
        trackingNumber: o.trackingNumber || "", shippopCode: o.shippopCode || "",
        shippedAt: sa, orderTotal: Number(o.total || 0),
      });
    });
    if (!orders.length) continue;
    orders.sort((a, b) => String(a.shippedAt).localeCompare(String(b.shippedAt)));
    let status = "unpaid", paidAt = null, note = "";
    try {
      const bill = await fs.collection("shippingBills").doc(label + "__" + tid).get();
      if (bill.exists) { const b = bill.data(); status = b.status || "unpaid"; paidAt = (b.paidAt && b.paidAt.toDate) ? b.paidAt.toDate().toISOString() : null; note = b.note || ""; }
    } catch (e) { /* ignore */ }
    brands.push({ tid: tid, name: tdata.name || tid, count: orders.length, total: Math.round(total * 100) / 100, status: status, paidAt: paidAt, note: note, orders: orders });
    grandTotal += total; grandCount += orders.length;
  }
  brands.sort((a, b) => b.total - a.total);
  return { month: label, brands: brands, grandTotal: Math.round(grandTotal * 100) / 100, grandCount: grandCount };
});

exports.setShippingBillStatus = onCall(async (req) => {
  requireSuperAdmin(req);
  const { label } = monthRange(req.data && req.data.month);
  const tid = String((req.data && req.data.tid) || "");
  const status = String((req.data && req.data.status) || "");
  if (!tid) throw new HttpsError("invalid-argument", "ต้องระบุ tid");
  if (status !== "paid" && status !== "unpaid") throw new HttpsError("invalid-argument", "status ต้องเป็น paid หรือ unpaid");
  await admin.firestore().collection("shippingBills").doc(label + "__" + tid).set({
    month: label, tid: tid, status: status,
    note: String((req.data && req.data.note) || ""),
    amount: Number((req.data && req.data.amount) || 0),
    count: Number((req.data && req.data.count) || 0),
    paidAt: status === "paid" ? FieldValue.serverTimestamp() : null,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { ok: true, month: label, tid: tid, status: status };
});

// ============================================================
//  fetchProductMeta — ดึงข้อมูลสินค้าจากลิงก์ (best-effort OG meta)
//  ช่วยเพิ่มสินค้าเร็วจากลิงก์ Shopee/เว็บร้าน · admin-only + กัน SSRF
// ============================================================
function isSafePublicUrl(u) {
  let url;
  try { url = new URL(u); } catch (e) { return false; }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (host === "metadata.google.internal") return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {   // บล็อก IP ในวงภายใน/loopback/link-local
    const p = host.split(".").map(Number);
    if (p[0] === 0 || p[0] === 10 || p[0] === 127 ||
        (p[0] === 192 && p[1] === 168) ||
        (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
        (p[0] === 169 && p[1] === 254)) return false;
  }
  if (host === "[::1]" || host.startsWith("[fc") || host.startsWith("[fd") || host.startsWith("[fe80")) return false;
  return true;
}
// B14: จำแนก IP ภายใน — ใช้เช็ค IP ที่ DNS resolve ได้ (กัน DNS-rebind ที่ isSafePublicUrl
// เช็คแค่ชื่อ host มองไม่เห็น)
function ipIsPrivate(ip) {
  const s = String(ip || "").toLowerCase();
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(s)) {
    const p = s.split(".").map(Number);
    return p[0] === 0 || p[0] === 10 || p[0] === 127 ||
      (p[0] === 192 && p[1] === 168) ||
      (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
      (p[0] === 169 && p[1] === 254);
  }
  return s === "::1" || s.startsWith("fc") || s.startsWith("fd") || s.startsWith("fe80")
    || s.startsWith("::ffff:127.") || s.startsWith("::ffff:10.") || s.startsWith("::ffff:192.168.");
}
exports._ipIsPrivate = ipIsPrivate;   // unit test
async function assertHostResolvesPublic(hostname) {
  const dns = require("dns").promises;
  let addrs;
  try { addrs = await dns.lookup(hostname, { all: true }); }
  catch (e) { throw new HttpsError("invalid-argument", "resolve โดเมนไม่ได้"); }
  for (const a of addrs) {
    if (ipIsPrivate(a.address)) throw new HttpsError("permission-denied", "โดเมนชี้ไปที่เครือข่ายภายใน (กัน SSRF)");
  }
}
// fetch ที่กัน SSRF: ตรวจ host + IP ที่ resolve ได้ ทุก hop ของ redirect (manual, สูงสุด 4 hop)
async function safeFetch(startUrl, opts) {
  let u = startUrl;
  for (let hop = 0; hop < 4; hop++) {
    if (!isSafePublicUrl(u)) throw new HttpsError("invalid-argument", "ลิงก์ไม่ปลอดภัย");
    await assertHostResolvesPublic(new URL(u).hostname);
    const res = await fetch(u, Object.assign({}, opts, { redirect: "manual" }));
    const loc = (res.status >= 300 && res.status < 400) ? res.headers.get("location") : null;
    if (loc) { u = new URL(loc, u).toString(); continue; }
    return res;
  }
  throw new HttpsError("unavailable", "redirect เยอะเกินไป");
}
function decodeEntities(s) {
  return String(s || "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#x27;/gi, "'")
    .replace(/&nbsp;/g, " ").trim();
}
function parseProductMeta(html, url) {
  const pick = (names) => {
    for (const n of names) {
      const res = [
        new RegExp('<meta[^>]+(?:property|name)=["\']' + n + '["\'][^>]+content=["\']([^"\']*)["\']', "i"),
        new RegExp('<meta[^>]+content=["\']([^"\']*)["\'][^>]+(?:property|name)=["\']' + n + '["\']', "i"),
      ];
      for (const re of res) { const m = re.exec(html); if (m && m[1]) return m[1]; }
    }
    return "";
  };
  const titleTag = (/<title[^>]*>([^<]*)<\/title>/i.exec(html) || [])[1] || "";
  // ตัดหาง " | Shopee Thailand" / " - Lazada" ฯลฯ ออกจากชื่อ
  const name = decodeEntities(pick(["og:title", "twitter:title"]) || titleTag)
    .replace(/\s*[|｜]\s*(Shopee|Lazada)\b.*$/i, "")
    .replace(/\s*[-–]\s*(Shopee|Lazada)\b.*$/i, "").trim();
  const image = pick(["og:image", "og:image:url", "og:image:secure_url", "twitter:image", "twitter:image:src"]);
  const description = decodeEntities(pick(["og:description", "twitter:description", "description"]));
  const priceRaw = pick(["product:price:amount", "og:price:amount", "og:product:price:amount", "product:sale_price:amount"]);
  const price = priceRaw ? String(priceRaw).replace(/[^\d.]/g, "") : "";
  return { name: name, image: image, description: description, price: price, url: url, found: !!(name || image || price) };
}
exports._isSafePublicUrl = isSafePublicUrl;       // export ไว้ unit test
exports._parseProductMeta = parseProductMeta;

exports.fetchProductMeta = onCall(async (req) => {
  const tid = await resolveTid(req.data && req.data.tid);
  requireAdmin(req, tid);   // เฉพาะแอดมิน (กันใช้เป็น open proxy)
  const url = ((req.data && req.data.url) || "").toString().trim();
  if (!isSafePublicUrl(url)) throw new HttpsError("invalid-argument", "ลิงก์ไม่ถูกต้อง (ต้องเป็น http/https สาธารณะ)");
  let html;
  try {
    const res = await safeFetch(url, {
      headers: {
        // ใช้ UA แบบ crawler — เว็บ marketplace (Shopee ฯลฯ) เสิร์ฟ OG tag ให้ตัวนี้ (UA browser จะโดนหน้า anti-bot)
        "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9",
        "Accept-Language": "th,en;q=0.9",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new HttpsError("unavailable", "ดึงหน้าไม่สำเร็จ (HTTP " + res.status + ") — เว็บอาจบล็อก ลองกรอกเอง");
    html = (await res.text()).slice(0, 600000);
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    throw new HttpsError("unavailable", "ดึงหน้าไม่สำเร็จ (" + (e.name || "error") + ") — เว็บอาจบล็อก server ลองกรอกเอง");
  }
  return Object.assign({ ok: true }, parseProductMeta(html, url));
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

    // ── จองโควต้ารายวัน (atomic) ก่อนเรียก Gemini ─────────
    // B9: เดิมอ่าน-เช็ค แล้วค่อย increment ทีหลัง → ยิงขนานอ่านค่าเดียวกันทะลุโควต้าได้
    //     (TOCTOU, ค่า Gemini บาน) → ย้ายมา reserve ใน transaction ก่อนเรียกจริง
    const today = new Date().toISOString().slice(0, 10);
    const quotaRef = troot(tid).collection("users").doc(uid)
      .collection("aiUsage").doc(today);
    let usedToday = 0;
    await admin.firestore().runTransaction(async (tx) => {
      const s = await tx.get(quotaRef);
      usedToday = s.exists ? (Number(s.data().count) || 0) : 0;
      if (usedToday >= DAILY_QUOTA) {
        throw new HttpsError("resource-exhausted",
          `วันนี้ใช้ครบ ${DAILY_QUOTA} ครั้งแล้ว ลองใหม่พรุ่งนี้นะครับ 🌱`);
      }
      tx.set(quotaRef, { count: usedToday + 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    });

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
      // B9: refund โควต้าที่จองไว้ — การเรียกไม่สำเร็จไม่ควรกินโควต้า
      await quotaRef.set({ count: FieldValue.increment(-1) }, { merge: true }).catch((e) => console.error("bg-write failed:", e && e.message));
      if (err instanceof HttpsError) throw err;
      console.error("analyzePlant error:", err);
      throw new HttpsError("internal", "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง");
    }

    // ── บันทึกประวัติ (โควต้าถูกจองไว้แล้วด้านบน) ──────
    const diagRef = await troot(tid).collection("users").doc(uid)
      .collection("diagnoses").add({
        crop: cropName,
        result: result,
        createdAt: FieldValue.serverTimestamp(),
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
    dailyLoginBonus: _num(d.dailyLoginBonus, 5),
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
// ── Badges (ตราสะสม) — data-driven ต่อ tenant จาก settings/badges ──
let _bdgCache = {}, _bdgAt = {};
async function getBadges(tid) {
  const now = Date.now();
  if (_bdgCache[tid] && (now - (_bdgAt[tid] || 0)) < 60000) return _bdgCache[tid];
  let list = [];
  try {
    const s = await troot(tid).collection("settings").doc("badges").get();
    if (s.exists && Array.isArray(s.data().list)) list = s.data().list;
  } catch (e) { /* fallback [] */ }
  _bdgCache[tid] = list; _bdgAt[tid] = now; return list;
}
function metricValue(metric, d) {
  if (metric === "helps")  return _num(d.helpCount, 0);
  if (metric === "points") return _num(d.points, 0);
  return _num(d.postCount, 0); // default = posts
}
async function earnedBadges(tid, d) {
  const list = await getBadges(tid);
  const out = [];
  for (const b of list) {
    if (!b || !b.id) continue;
    if (metricValue(b.metric, d) >= _num(b.threshold, 0)) out.push(b.id);
  }
  return out;
}

async function updateTier(userRef, tid) {
  const P = await getPts(tid);
  const snap = await userRef.get();
  const d = snap.data() || {};
  const newTier = calcTier(d.points || 0, P.tiers);
  const updates = {};
  if (d.tier !== newTier) updates.tier = newTier;
  // award badges ที่ถึงเกณฑ์ (idempotent ด้วย arrayUnion)
  const earned = await earnedBadges(tid, d);
  const have = Array.isArray(d.badges) ? d.badges : [];
  const fresh = earned.filter((x) => have.indexOf(x) === -1);
  if (fresh.length) updates.badges = FieldValue.arrayUnion(...fresh);
  if (Object.keys(updates).length) await userRef.update(updates);
}

// ── Earn Campaigns (แคมเปญแต้ม) — กติกาสะสมแต้มที่ร้านตั้งเอง ต่อ trigger ──
// อ่านแคมเปญที่ active + อยู่ในช่วงเวลา (startAt/endAt optional) ของ trigger นั้น
// query แค่ trigger== (single-field index) แล้วกรอง active/เวลาใน memory (ไม่ต้องมี composite index)
async function activeEarnCampaigns(tid, trigger, nowMs) {
  let snap;
  try {
    snap = await troot(tid).collection("earnCampaigns").where("trigger", "==", trigger).get();
  } catch (e) { return []; }
  return snap.docs.map((d) => d.data()).filter((c) => {
    if (c.active === false) return false;
    const s = c.startAt && typeof c.startAt.toMillis === "function" ? c.startAt.toMillis() : null;
    const e = c.endAt && typeof c.endAt.toMillis === "function" ? c.endAt.toMillis() : null;
    if (s !== null && nowMs < s) return false;
    if (e !== null && nowMs > e) return false;
    return true;
  });
}

// โปรฯ คูณแต้มทั้งร้าน (settings/promo) — คูณแต้มทุกอย่าง (ซื้อ+โพสต์) ในช่วงเวลา
// คืน 1 ถ้าไม่มี/ปิด/นอกช่วง · สแต็กกับตัวคูณราย campaign (คูณซ้อน)
async function getPromoMultiplier(tid, nowMs) {
  try {
    const s = await troot(tid).collection("settings").doc("promo").get();
    if (!s.exists) return 1;
    const d = s.data() || {};
    if (d.active === false) return 1;
    const m = Math.max(1, _num(d.multiplier, 1));
    if (m <= 1) return 1;
    const st = d.startAt && typeof d.startAt.toMillis === "function" ? d.startAt.toMillis() : null;
    const en = d.endAt && typeof d.endAt.toMillis === "function" ? d.endAt.toMillis() : null;
    if (st !== null && nowMs < st) return 1;
    if (en !== null && nowMs > en) return 1;
    return m;
  } catch (e) { return 1; }
}

exports.onPostCreated = onDocumentCreated(
  { document: "tenants/{tid}/posts/{postId}", region: "asia-southeast1" },
  async (event) => {
    const post = event.data?.data();
    if (!post?.authorId) return;
    const tid = event.params.tid;
    const P = await getPts(tid);
    const pts = post.imageUrl ? P.perPostWithImg : P.perPost;
    // โบนัสจากแคมเปญแต้ม trigger=post (บวกเพิ่มจากแต้มโพสต์ปกติ)
    let bonus = 0;
    const camps = await activeEarnCampaigns(tid, "post", Date.now());
    for (const c of camps) {
      const bp = Math.max(0, Math.floor(_num(c.bonusPoints, 0)));
      const mult = Math.max(1, _num(c.multiplier, 1));
      bonus += Math.floor(bp * mult);
    }
    // โปรฯ คูณทั้งร้าน คูณแต้มโพสต์ทั้งก้อน (perPost ปกติ + โบนัสแคมเปญ)
    const promo = await getPromoMultiplier(tid, Date.now());
    const total = Math.floor((pts + bonus) * promo);
    const ref = troot(tid).collection("users").doc(post.authorId);
    await ref.update({
      points:    FieldValue.increment(total),
      postCount: FieldValue.increment(1),
    });
    await updateTier(ref, tid);
    // A3: เก็บแต้มที่ให้จริงไว้บนโพสต์ เพื่อคืนได้เป๊ะตอนลบ (campaign/promo อาจเปลี่ยนภายหลัง)
    await event.data.ref.update({ pointsAwarded: total }).catch((e) => console.error("bg-write failed:", e && e.message));
    // group post counter (โพสต์ในกลุ่ม → นับให้กลุ่ม)
    if (post.groupId) {
      await troot(tid).collection("groups").doc(post.groupId)
        .update({ postCount: FieldValue.increment(1) }).catch((e) => console.error("bg-write failed:", e && e.message));
    }
  }
);

exports.onCommentCreated = onDocumentCreated(
  { document: "tenants/{tid}/posts/{postId}/comments/{commentId}", region: "asia-southeast1" },
  async (event) => {
    const cmt = event.data?.data();
    if (!cmt?.authorId) return;
    const tid = event.params.tid;
    const postRef = troot(tid).collection("posts").doc(event.params.postId);
    await postRef.update({ comments: FieldValue.increment(1) }).catch((e) => console.error("bg-write failed:", e && e.message));
    const marker = postRef.collection("commentAwarded").doc(cmt.authorId);
    if ((await marker.get()).exists) return;
    await marker.set({ at: FieldValue.serverTimestamp() });
    const ref = troot(tid).collection("users").doc(cmt.authorId);
    const P = await getPts(tid);
    await ref.update({ points: FieldValue.increment(P.perComment) });
    await updateTier(ref, tid);
  }
);

const { onDocumentDeleted } = require("firebase-functions/v2/firestore");
exports.onCommentDeleted = onDocumentDeleted(
  { document: "tenants/{tid}/posts/{postId}/comments/{commentId}", region: "asia-southeast1" },
  async (event) => {
    await troot(event.params.tid).collection("posts").doc(event.params.postId)
      .update({ comments: FieldValue.increment(-1) }).catch((e) => console.error("bg-write failed:", e && e.message));
  }
);

// ── ไลก์/ช่วยได้ → server-side ──
const { onDocumentWritten } = require("firebase-functions/v2/firestore");

async function awardOnce(tid, postId, actorUid, markerCol, authorId, pts, extra) {
  if (!authorId || actorUid === authorId) return;
  const marker = troot(tid).collection("posts").doc(postId).collection(markerCol).doc(actorUid);
  const got = await marker.get();
  if (got.exists) return;
  await marker.set({ at: FieldValue.serverTimestamp() });
  const uref = troot(tid).collection("users").doc(authorId);
  await uref.update(Object.assign({ points: FieldValue.increment(pts) }, extra || {}));
  await updateTier(uref, tid);
}

exports.onLikeWrite = onDocumentWritten(
  { document: "tenants/{tid}/posts/{postId}/likes/{uid}", region: "asia-southeast1" },
  async (event) => {
    const before = event.data?.before, after = event.data?.after;
    const had = before?.exists, has = after?.exists;
    const tid = event.params.tid;
    const postRef = troot(tid).collection("posts").doc(event.params.postId);
    const inc = FieldValue.increment;
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
      await postRef.update({ helps: FieldValue.increment(1) });
      const P = await getPts(tid);
      await awardOnce(tid, event.params.postId, event.params.uid, "helpAwarded", p.data().authorId, P.perHelp, { helpCount: FieldValue.increment(1) });
    } else if (had && !has) {
      const p = await postRef.get(); if (!p.exists) return;
      await postRef.update({ helps: FieldValue.increment(-1) });
    }
  }
);

// ── กลุ่มชุมชน (Community Groups) counters ──
// นับโพสต์ในกลุ่มลดเมื่อโพสต์ถูกลบ (keep postCount แม่นยำ)
exports.onPostDeleted = onDocumentDeleted(
  { document: "tenants/{tid}/posts/{postId}", region: "asia-southeast1" },
  async (event) => {
    const post = event.data?.data();
    if (!post) return;
    const tid = event.params.tid;
    // A3: คืนแต้ม + postCount ที่ onPostCreated เคยให้ (กัน farm ด้วยการสร้าง/ลบโพสต์วน)
    // ใช้ค่า pointsAwarded ที่ stamp ไว้บนโพสต์ (เป๊ะตามที่ให้จริง) · clamp ไม่ให้ติดลบ
    if (post.authorId) {
      const awarded = Math.max(0, Math.floor(Number(post.pointsAwarded) || 0));
      const uref = troot(tid).collection("users").doc(post.authorId);
      await admin.firestore().runTransaction(async (tx) => {
        const s = await tx.get(uref);
        if (!s.exists) return;
        const d = s.data();
        tx.update(uref, {
          points:    Math.max(0, Math.floor(Number(d.points) || 0) - awarded),
          postCount: Math.max(0, Math.floor(Number(d.postCount) || 0) - 1),
        });
      }).catch((e) => console.error("bg-write failed:", e && e.message));
      await updateTier(uref, tid);
    }
    // นับโพสต์ในกลุ่มลดเมื่อโพสต์ถูกลบ (keep group.postCount แม่นยำ)
    if (post.groupId) {
      await troot(tid).collection("groups").doc(post.groupId)
        .update({ postCount: FieldValue.increment(-1) }).catch((e) => console.error("bg-write failed:", e && e.message));
    }
  }
);

// นับสมาชิกกลุ่ม (join/leave) → memberCount (ตาม pattern onLikeWrite)
exports.onGroupMemberWrite = onDocumentWritten(
  { document: "tenants/{tid}/groups/{gid}/members/{uid}", region: "asia-southeast1" },
  async (event) => {
    const had = event.data?.before?.exists, has = event.data?.after?.exists;
    if (had === has) return;
    const inc = has ? 1 : -1;
    await troot(event.params.tid).collection("groups").doc(event.params.gid)
      .update({ memberCount: FieldValue.increment(inc) }).catch((e) => console.error("bg-write failed:", e && e.message));
  }
);

// ── แคมเปญแต้ม trigger=purchase — ให้แต้มเมื่อออเดอร์ยืนยันรับเงิน (confirmed) ──
// server-authoritative + idempotent (flag pointsAwarded บนออเดอร์) · คิดจาก subtotal (มูลค่าสินค้า)
exports.onOrderConfirmed = onDocumentUpdated(
  { document: "tenants/{tid}/orders/{orderId}", region: "asia-southeast1" },
  async (event) => {
    const before = event.data?.before?.data() || {};
    const after  = event.data?.after?.data() || {};
    if (before.status === after.status) return;      // status ไม่เปลี่ยน (กันลูปตอนเราเขียน pointsAwarded)
    if (after.status !== "confirmed") return;         // ให้แต้มเฉพาะตอนยืนยันรับเงิน
    if (after.pointsAwarded === true) return;         // กันซ้ำ
    const uid = after.userId; if (!uid) return;
    const tid = event.params.tid;
    const subtotal = Math.max(0, Math.floor(_num(after.subtotal, 0)));

    const camps = await activeEarnCampaigns(tid, "purchase", Date.now());
    let pts = 0;
    for (const c of camps) {
      const per  = Math.max(1, Math.floor(_num(c.ratePerBaht, 0)));
      const rp   = Math.max(0, Math.floor(_num(c.ratePoints, 0)));
      const min  = Math.max(0, Math.floor(_num(c.minSpend, 0)));
      const mult = Math.max(1, _num(c.multiplier, 1));
      if (!rp || subtotal < min) continue;
      pts += Math.floor(Math.floor(subtotal / per) * rp * mult);
    }
    // โปรฯ คูณทั้งร้าน คูณแต้มจากการซื้อทั้งหมด (สแต็กกับตัวคูณราย campaign)
    const promo = await getPromoMultiplier(tid, Date.now());
    pts = Math.floor(pts * promo);

    const orderRef = troot(tid).collection("orders").doc(event.params.orderId);
    if (pts <= 0) { await orderRef.update({ pointsAwarded: true, pointsEarned: 0 }).catch((e) => console.error("bg-write failed:", e && e.message)); return; }
    const uref = troot(tid).collection("users").doc(uid);
    await uref.update({ points: FieldValue.increment(pts) });
    await updateTier(uref, tid);
    await orderRef.update({ pointsAwarded: true, pointsEarned: pts }).catch((e) => console.error("bg-write failed:", e && e.message));
  }
);

const { onDocumentUpdated: onDocUpd } = require("firebase-functions/v2/firestore");
async function sendNotif(tid, uid, text, icon) {
  if (!uid) return;
  await troot(tid).collection("notifications").add({ uid, text, icon: icon || "bell", read: false, createdAt: FieldValue.serverTimestamp() });
  const uSnap = await troot(tid).collection("users").doc(uid).get();
  const token = uSnap.data() && uSnap.data().fcmToken;
  if (!token) return;
  try {
    await admin.messaging().send({ token, notification: { title: "phuansuan", body: text }, webpush: { notification: { icon: "/icons/icon-192.png" } } });
  } catch (e) {
    if (e.code === "messaging/registration-token-not-registered") {
      await troot(tid).collection("users").doc(uid).update({ fcmToken: FieldValue.delete() });
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
