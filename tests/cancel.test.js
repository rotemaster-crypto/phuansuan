// ============================================================
//  adminCancelOrder — e2e ผ่าน emulator (คืนสต็อกตอนยกเลิก)
//  รัน (พร้อมไฟล์อื่น, serial):
//    firebase emulators:exec --only functions,firestore,auth --project demo-bocean \
//      "node --test --test-concurrency=1 tests/spin.test.js tests/place.test.js tests/cancel.test.js"
//  ทดสอบ: แอดมินยกเลิก → คืนสต็อก atomic, idempotent, ข้าม order ไม่ stockApplied, สิทธิ์
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

let env, cancel, auth, uid;

// ตั้ง custom claim admin=true บน auth emulator แล้ว refresh token
async function setAdminClaim(on) {
  await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:update', {
    method: 'POST',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ localId: uid, customAttributes: JSON.stringify(on ? { admin: true } : {}) }),
  });
  await auth.currentUser.getIdToken(true);   // บังคับ refresh token ให้ได้ claim ใหม่
}

before(async () => {
  env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { host: '127.0.0.1', port: 8080 } });
  const app = initializeApp({ projectId: PROJECT, apiKey: 'fake-api-key' });
  auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const functions = getFunctions(app, 'asia-southeast1');
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  uid = (await signInAnonymously(auth)).user.uid;
  cancel = (data) => httpsCallable(functions, 'adminCancelOrder')(data).then((r) => r.data);
});
after(async () => { await env.cleanup(); });

async function seed(order, products) {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `tenants/${TID}`), { status: 'active' });
    for (const p of products) await setDoc(doc(db, `tenants/${TID}/products/${p.id}`), p);
    await setDoc(doc(db, `tenants/${TID}/orders/o1`), order);
  });
}
async function read(path) {
  let out;
  await env.withSecurityRulesDisabled(async (ctx) => { out = await getDoc(doc(ctx.firestore(), path)); });
  return out.data();
}
// order ที่ผ่าน placeOrder (ตัดสต็อกแล้ว): product stock ถูกหักไปแล้ว
const ORD = { status: 'pending_payment', stockApplied: true, items: [{ id: 'p1', qty: 3 }], total: 300 };

// ── B2 step3: openOrders ── (คืน pending → ลด, confirmed → ไม่ลดซ้ำ)
test('B2 step3: ยกเลิกออเดอร์ pending → ลด openOrders เจ้าของ', async () => {
  await setAdminClaim(true);
  await seed({ status: 'pending_payment', stockApplied: true, userId: 'buyer', items: [{ id: 'p1', qty: 1 }] },
    [{ id: 'p1', name: 'A', price: 100, stock: 9, active: true }]);
  await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), `tenants/${TID}/users/buyer`), { openOrders: 3 }); });
  await cancel({ tid: TID, orderId: 'o1' });
  assert.equal((await read(`tenants/${TID}/users/buyer`)).openOrders, 2);
});
test('B2 step3: ยกเลิกออเดอร์ confirmed → ไม่ลด openOrders ซ้ำ', async () => {
  await setAdminClaim(true);
  await seed({ status: 'confirmed', stockApplied: true, userId: 'buyer', items: [{ id: 'p1', qty: 1 }] },
    [{ id: 'p1', name: 'A', price: 100, stock: 9, active: true }]);
  await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), `tenants/${TID}/users/buyer`), { openOrders: 0 }); });
  await cancel({ tid: TID, orderId: 'o1' });
  assert.equal((await read(`tenants/${TID}/users/buyer`)).openOrders, 0, 'confirmed ถูกลดตอน confirm แล้ว');
});

// ── สิทธิ์: ไม่ใช่แอดมิน → permission-denied ────────────────
test('ไม่ใช่แอดมิน → permission-denied', async () => {
  await setAdminClaim(false);
  await seed(ORD, [{ id: 'p1', name: 'A', price: 100, stock: 7, active: true }]);
  await assert.rejects(() => cancel({ tid: TID, orderId: 'o1' }), (e) => {
    assert.match(String(e.code || ''), /permission-denied$/); return true;
  });
});

// ── คืนสต็อก: ยกเลิก → stock += qty, soldCount -= qty ────────
test('แอดมินยกเลิก → คืนสต็อก 7→10, order = cancelled', async () => {
  await setAdminClaim(true);
  await seed(ORD, [{ id: 'p1', name: 'A', price: 100, stock: 7, soldCount: 5, active: true }]);
  const res = await cancel({ tid: TID, orderId: 'o1' });
  assert.equal(res.restocked, true);
  const o = await read(`tenants/${TID}/orders/o1`);
  assert.equal(o.status, 'cancelled');
  assert.equal(o.restocked, true);
  const p = await read(`tenants/${TID}/products/p1`);
  assert.equal(p.stock, 10);       // 7 + 3
  assert.equal(p.soldCount, 2);    // 5 - 3
});

// ── idempotent: ยกเลิกซ้ำ → ไม่คืนสต็อกซ้ำ ──────────────────
test('ยกเลิกซ้ำ → alreadyCancelled, สต็อกไม่เพิ่มซ้ำ', async () => {
  await setAdminClaim(true);
  await seed(ORD, [{ id: 'p1', name: 'A', price: 100, stock: 7, active: true }]);
  await cancel({ tid: TID, orderId: 'o1' });
  const res2 = await cancel({ tid: TID, orderId: 'o1' });
  assert.equal(res2.alreadyCancelled, true);
  const p = await read(`tenants/${TID}/products/p1`);
  assert.equal(p.stock, 10);       // ยังคง 10 (ไม่ +3 ซ้ำ)
});

// ── order เก่า (ไม่ stockApplied) → ยกเลิกได้แต่ไม่คืนสต็อก ──
test('order ไม่ stockApplied → cancelled แต่ไม่คืนสต็อก', async () => {
  await setAdminClaim(true);
  await seed({ status: 'paid_review', items: [{ id: 'p1', qty: 3 }] }, [{ id: 'p1', name: 'A', price: 100, stock: 7, active: true }]);
  const res = await cancel({ tid: TID, orderId: 'o1' });
  assert.equal(res.restocked, false);
  const p = await read(`tenants/${TID}/products/p1`);
  assert.equal(p.stock, 7);        // ไม่แตะ
});

// ── สินค้าไม่จำกัดสต็อก (null) → คืนเฉพาะ soldCount ─────────
test('stock null → ไม่คืน stock แต่ soldCount -= qty', async () => {
  await setAdminClaim(true);
  await seed(ORD, [{ id: 'p1', name: 'A', price: 100, stock: null, soldCount: 8, active: true }]);
  const res = await cancel({ tid: TID, orderId: 'o1' });
  assert.equal(res.restocked, true);
  const p = await read(`tenants/${TID}/products/p1`);
  assert.equal(p.stock, null);
  assert.equal(p.soldCount, 5);    // 8 - 3
});
