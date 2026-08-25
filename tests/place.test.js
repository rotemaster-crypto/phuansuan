// ============================================================
//  placeOrder — e2e ผ่าน emulator (functions + firestore + auth)
//  รันด้วย:
//    firebase emulators:exec --only functions,firestore,auth --project demo-bocean \
//      "node --test --test-concurrency=1 tests/spin.test.js tests/place.test.js"
//  ทดสอบ: สร้างออเดอร์ server-side + ตัดสต็อก + soldCount + คูปอง atomic,
//         subtotal จากราคาจริงใน DB, กันขายเกิน/สินค้าปิด, tier discount, กันคูปองซ้ำ
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
  place = (data) => httpsCallable(functions, 'placeOrder')(data).then((r) => r.data);
});
after(async () => { await env.cleanup(); });

// seed สินค้า (+ คูปอง + ค่าจัดส่ง) ข้าม rules
async function seed(products, coupon, commerce) {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `tenants/${TID}`), { status: 'active' });
    await setDoc(doc(db, `tenants/${TID}/users/${uid}`), { points: 0 });
    for (const p of products) await setDoc(doc(db, `tenants/${TID}/products/${p.id}`), p);
    if (coupon) await setDoc(doc(db, `tenants/${TID}/users/${uid}/coupons/${coupon.id}`), coupon);
    if (commerce) await setDoc(doc(db, `tenants/${TID}/settings/commerce`), commerce);
  });
}
async function read(path) {
  let out;
  await env.withSecurityRulesDisabled(async (ctx) => { out = await getDoc(doc(ctx.firestore(), path)); });
  return out.data();
}
async function expectFail(data, codeSuffix) {
  await assert.rejects(() => place(data), (e) => {
    assert.match(String(e.code || ''), new RegExp(codeSuffix + '$'), `code ควรลงท้าย ${codeSuffix} แต่ได้ ${e.code}`);
    return true;
  });
}
const P1 = { id: 'p1', name: 'ปุ๋ย A', price: 100, stock: 10, active: true };
const ship = { name: 'ก', phone: '0812345678', addressLine: 'x', province: 'y' };
function order(items, extra) { return Object.assign({ userName: 'ทดสอบ', items, discountPct: 0, shippingFee: 30, weight: 1, shipping: ship }, extra || {}); }

// ── 1. สั่งปกติ → order + ตัดสต็อก + soldCount ──────────────
test('สั่ง P1 x2 → order total 230, stock 10→8, soldCount +2', async () => {
  await seed([P1]);
  const res = await place({ tid: TID, order: order([{ id: 'p1', qty: 2 }]) });
  assert.equal(res.subtotal, 200);         // 100 x 2 (ราคาจาก DB)
  assert.equal(res.total, 230);            // 200 + 30 (ไม่มี settings/commerce → เชื่อค่าส่ง client)
  const o = await read(`tenants/${TID}/orders/${res.orderId}`);
  assert.equal(o.status, 'pending_payment');
  assert.equal(o.userId, uid);
  assert.equal(o.items[0].qty, 2);
  assert.equal(o.stockApplied, true);      // มี flag ให้ adminCancelOrder คืนสต็อก
  const p = await read(`tenants/${TID}/products/p1`);
  assert.equal(p.stock, 8);
  assert.equal(p.soldCount, 2);
});

// ── 2. subtotal ใช้ราคา DB ไม่เชื่อ client ──────────────────
test('client ส่งราคา 1 → server ใช้ราคาจริง 100', async () => {
  await seed([P1]);
  const res = await place({ tid: TID, order: order([{ id: 'p1', qty: 1, price: 1 }]) });
  assert.equal(res.subtotal, 100);
});

// ── 3. สต็อกไม่พอ → ปฏิเสธ, สต็อกไม่ขยับ, ไม่มี order ────────
test('สั่งเกินสต็อก → failed-precondition, stock คงเดิม', async () => {
  await seed([{ id: 'p3', name: 'ของหายาก', price: 80, stock: 1, active: true }]);
  await expectFail({ tid: TID, order: order([{ id: 'p3', qty: 2 }]) }, 'failed-precondition');
  const p = await read(`tenants/${TID}/products/p3`);
  assert.equal(p.stock, 1);
  assert.ok(!p.soldCount);
});

// ── 4. สินค้าหมด (stock 0) → ปฏิเสธ ─────────────────────────
test('stock 0 → failed-precondition', async () => {
  await seed([{ id: 'p0', name: 'หมดแล้ว', price: 50, stock: 0, active: true }]);
  await expectFail({ tid: TID, order: order([{ id: 'p0', qty: 1 }]) }, 'failed-precondition');
});

// ── 5. สินค้าปิดขาย → ปฏิเสธ ────────────────────────────────
test('active:false → failed-precondition', async () => {
  await seed([{ id: 'px', name: 'ปิดขาย', price: 50, stock: 5, active: false }]);
  await expectFail({ tid: TID, order: order([{ id: 'px', qty: 1 }]) }, 'failed-precondition');
});

// ── 6. สต็อกไม่จำกัด (null) → ไม่ตัดสต็อก แต่ soldCount ++ ────
test('stock null → order ok, stock ยัง null, soldCount +3', async () => {
  await seed([{ id: 'pu', name: 'ไม่จำกัด', price: 50, stock: null, active: true }]);
  const res = await place({ tid: TID, order: order([{ id: 'pu', qty: 3 }]) });
  assert.equal(res.subtotal, 150);
  const p = await read(`tenants/${TID}/products/pu`);
  assert.equal(p.stock, null);
  assert.equal(p.soldCount, 3);
});

// ── 7. tier discount คิดฝั่ง server จาก discountPct ──────────
test('discountPct 10 → discount 20, total 210', async () => {
  await seed([P1]);
  const res = await place({ tid: TID, order: order([{ id: 'p1', qty: 2 }], { discountPct: 10 }) });
  assert.equal(res.discount, 20);          // 10% ของ 200
  assert.equal(res.total, 210);            // 200 - 20 + 30
});

// ── 8. คูปอง fixed + ตัดสต็อก atomic ────────────────────────
test('คูปอง ฿50 + P1 x1 → total 80, coupon used, stock 10→9', async () => {
  await seed([P1], { id: 'c1', code: 'SAVE50', prizeLabel: 'ลด 50', discountType: 'fixed', discountValue: 50, used: false });
  const res = await place({ tid: TID, couponId: 'c1', order: order([{ id: 'p1', qty: 1 }]) });
  assert.equal(res.subtotal, 100);
  assert.equal(res.couponDiscount, 50);
  assert.equal(res.total, 80);             // 100 - 50 + 30
  const o = await read(`tenants/${TID}/orders/${res.orderId}`);
  assert.equal(o.couponId, 'c1');
  assert.equal(o.couponDiscount, 50);
  const p = await read(`tenants/${TID}/products/p1`);
  assert.equal(p.stock, 9);
  const c = await read(`tenants/${TID}/users/${uid}/coupons/c1`);
  assert.equal(c.used, true);
  assert.equal(c.orderId, res.orderId);
});

// ── 9. คูปองใช้ซ้ำ → ทั้ง tx roll back (สต็อกไม่ถูกตัด) ──────
test('คูปอง used แล้ว → failed-precondition, stock ไม่ถูกตัด', async () => {
  await seed([P1], { id: 'c2', code: 'X', discountType: 'fixed', discountValue: 50, used: true });
  await expectFail({ tid: TID, couponId: 'c2', order: order([{ id: 'p1', qty: 1 }]) }, 'failed-precondition');
  const p = await read(`tenants/${TID}/products/p1`);
  assert.equal(p.stock, 10);               // ไม่ถูกตัดเพราะ tx ล้มทั้งก้อน
});

// ── 10. ตะกร้าว่าง → invalid-argument ───────────────────────
test('ตะกร้าว่าง → invalid-argument', async () => {
  await seed([P1]);
  await expectFail({ tid: TID, order: order([]) }, 'invalid-argument');
});

// ── ค่าจัดส่ง server-side (settings/commerce) ───────────────
// P1 x1 = subtotal 100, weight 1 kg (weightKg default 1). client ส่ง shippingFee 30 มาแต่ server คิดเอง
test('flat: ค่าส่งเหมา 40 (ไม่สนค่าส่ง client)', async () => {
  await seed([P1], null, { shipMode: 'flat', flatFee: 40 });
  const res = await place({ tid: TID, order: order([{ id: 'p1', qty: 1 }]) });
  assert.equal(res.shippingFee, 40);
  assert.equal(res.total, 140);            // 100 + 40
});
test('free: ส่งฟรีทุกออเดอร์', async () => {
  await seed([P1], null, { shipMode: 'free', flatFee: 40 });
  const res = await place({ tid: TID, order: order([{ id: 'p1', qty: 1 }]) });
  assert.equal(res.shippingFee, 0);
  assert.equal(res.total, 100);
});
test('freeOver: ซื้อครบ 200 ส่งฟรี — ถึงยอด', async () => {
  await seed([P1], null, { shipMode: 'flat', flatFee: 40, freeOver: true, freeOverMin: 200 });
  const res = await place({ tid: TID, order: order([{ id: 'p1', qty: 2 }]) });   // subtotal 200
  assert.equal(res.shippingFee, 0);
  assert.equal(res.total, 200);
});
test('freeOver: ไม่ถึงยอด → คิดค่าส่งเหมา', async () => {
  await seed([P1], null, { shipMode: 'flat', flatFee: 40, freeOver: true, freeOverMin: 200 });
  const res = await place({ tid: TID, order: order([{ id: 'p1', qty: 1 }]) });   // subtotal 100 < 200
  assert.equal(res.shippingFee, 40);
});
test('weight: กก.แรก 40 + กก.ถัดไป 20 (P1 x3 = 3kg → 40+2*20=80)', async () => {
  await seed([P1], null, { shipMode: 'weight', weightBase: 40, weightPerKg: 20 });
  const res = await place({ tid: TID, order: order([{ id: 'p1', qty: 3 }]) });   // weight 3kg
  assert.equal(res.shippingFee, 80);
});
