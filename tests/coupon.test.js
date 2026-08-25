// ============================================================
//  placeOrderWithCoupon — e2e ผ่าน emulator (functions + firestore + auth)
//  รันด้วย:
//    firebase emulators:exec --only functions,firestore,auth --project demo-bocean \
//      "node --test tests/coupon.test.js"
//  ทดสอบ: สร้างออเดอร์ + ใช้คูปอง atomic, คำนวณส่วนลด server-side, กันใช้ซ้ำ
// ============================================================
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInAnonymously } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const PROJECT = 'demo-bocean';
const TID = 'demo';

let env, place, uid;

before(async () => {
  env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { host: '127.0.0.1', port: 8080 } });
  const app = initializeApp({ projectId: PROJECT, apiKey: 'fake-api-key' });
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const functions = getFunctions(app, 'asia-southeast1');
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  uid = (await signInAnonymously(auth)).user.uid;
  place = (data) => httpsCallable(functions, 'placeOrderWithCoupon')(data).then((r) => r.data);
});
after(async () => { await env.cleanup(); });

// seed คูปอง 1 ใบ (ข้าม rules)
async function seedCoupon(couponId, coupon) {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `tenants/${TID}`), { status: 'active' });
    await setDoc(doc(db, `tenants/${TID}/users/${uid}`), { points: 0 });
    await setDoc(doc(db, `tenants/${TID}/users/${uid}/coupons/${couponId}`), coupon);
  });
}
async function read(path) {
  let out;
  await env.withSecurityRulesDisabled(async (ctx) => { out = await getDoc(doc(ctx.firestore(), path)); });
  return out;
}
async function expectFail(data, codeSuffix) {
  await assert.rejects(() => place(data), (e) => {
    assert.match(String(e.code || ''), new RegExp(codeSuffix + '$'), `code ควรลงท้าย ${codeSuffix} แต่ได้ ${e.code}`);
    return true;
  });
}

// order พื้นฐาน: ยอดสินค้า 200, ส่วนลดสมาชิก 0, ค่าส่ง 30 → base = 200
const baseOrder = {
  userName: 'ทดสอบ',
  items: [{ id: 'p1', name: 'ปุ๋ย', price: 100, qty: 2 }],
  subtotal: 200, discountPct: 0, discount: 0, shippingFee: 30, weight: 2,
  shipping: { name: 'ก', phone: '0812345678', addressLine: 'x', province: 'y' },
};

// ── 1. คูปองบาท (fixed) → หักตรง, order+coupon ถูกต้อง ───────
test('fixed ฿50 → total 180, coupon used, order ผูก couponId', async () => {
  await seedCoupon('c1', { code: 'SAVE50', prizeLabel: 'ลด 50', discountType: 'fixed', discountValue: 50, used: false });
  const res = await place({ tid: TID, couponId: 'c1', order: baseOrder });
  assert.equal(res.couponDiscount, 50);
  assert.equal(res.total, 180);           // 200 - 50 + 30
  assert.ok(res.orderId);

  const o = (await read(`tenants/${TID}/orders/${res.orderId}`)).data();
  assert.equal(o.total, 180);
  assert.equal(o.couponDiscount, 50);
  assert.equal(o.couponId, 'c1');
  assert.equal(o.couponCode, 'SAVE50');
  assert.equal(o.status, 'pending_payment');
  assert.equal(o.userId, uid);
  assert.equal(o.promptpayAmount, 180);

  const c = (await read(`tenants/${TID}/users/${uid}/coupons/c1`)).data();
  assert.equal(c.used, true);
  assert.equal(c.orderId, res.orderId);
});

// ── 2. คูปองเปอร์เซ็นต์ (percent) ───────────────────────────
test('percent 10% → หัก 20, total 210', async () => {
  await seedCoupon('c2', { code: 'TEN', prizeLabel: 'ลด 10%', discountType: 'percent', discountValue: 10, used: false });
  const res = await place({ tid: TID, couponId: 'c2', order: baseOrder });
  assert.equal(res.couponDiscount, 20);   // 10% ของ 200
  assert.equal(res.total, 210);           // 200 - 20 + 30
});

// ── 3. ส่วนลดมากกว่ายอด → clamp ไม่ติดลบ ────────────────────
test('fixed ฿500 (> ยอด) → clamp 200, total = ค่าส่ง 30', async () => {
  await seedCoupon('c3', { code: 'BIG', prizeLabel: 'ลดเยอะ', discountType: 'fixed', discountValue: 500, used: false });
  const res = await place({ tid: TID, couponId: 'c3', order: baseOrder });
  assert.equal(res.couponDiscount, 200);
  assert.equal(res.total, 30);
});

// ── 4. กันใช้ซ้ำ: คูปองที่ used แล้ว → ปฏิเสธ ────────────────
test('คูปอง used แล้ว → failed-precondition, ไม่สร้าง order', async () => {
  await seedCoupon('c4', { code: 'X', prizeLabel: 'ใช้แล้ว', discountType: 'fixed', discountValue: 50, used: true });
  await expectFail({ tid: TID, couponId: 'c4', order: baseOrder }, 'failed-precondition');
});

// ── 5. คูปองโชว์เฉยๆ (ไม่มี discountType) → ใช้ลดราคาไม่ได้ ──
test('คูปอง display-only → failed-precondition', async () => {
  await seedCoupon('c5', { code: 'SHOW', prizeLabel: 'ของแถม', discountType: null, discountValue: 0, used: false });
  await expectFail({ tid: TID, couponId: 'c5', order: baseOrder }, 'failed-precondition');
});

// ── 6. คูปองไม่มีจริง → not-found ───────────────────────────
test('couponId ไม่มีจริง → not-found', async () => {
  await seedCoupon('c6', { code: 'Y', discountType: 'fixed', discountValue: 10, used: false });
  await expectFail({ tid: TID, couponId: 'ไม่มี', order: baseOrder }, 'not-found');
});

// ── 7. ไม่ส่ง couponId / ตะกร้าว่าง → invalid-argument ──────
test('ไม่ส่ง couponId → invalid-argument', async () => {
  await seedCoupon('c7', { code: 'Z', discountType: 'fixed', discountValue: 10, used: false });
  await expectFail({ tid: TID, order: baseOrder }, 'invalid-argument');
});
test('ตะกร้าว่าง → invalid-argument', async () => {
  await seedCoupon('c8', { code: 'W', discountType: 'fixed', discountValue: 10, used: false });
  await expectFail({ tid: TID, couponId: 'c8', order: Object.assign({}, baseOrder, { items: [] }) }, 'invalid-argument');
});

// ── 8. ส่วนลดสมาชิกซ้อนคูปอง: base = subtotal - tier ────────
test('มีส่วนลดสมาชิก 20 + fixed ฿50 → คูปองลดจาก 180', async () => {
  await seedCoupon('c9', { code: 'COMBO', prizeLabel: 'ลด 50', discountType: 'fixed', discountValue: 50, used: false });
  const order = Object.assign({}, baseOrder, { discount: 20 });   // base = 200 - 20 = 180
  const res = await place({ tid: TID, couponId: 'c9', order });
  assert.equal(res.couponDiscount, 50);
  assert.equal(res.total, 160);           // 180 - 50 + 30
});
