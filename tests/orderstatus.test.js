// ============================================================
//  setOrderStatus — order state machine (B2) e2e ผ่าน emulator
//  รัน: firebase emulators:exec --only functions,firestore,auth --project demo-bocean \
//         "node --test tests/orderstatus.test.js"
//  ทดสอบ: transition ที่ถูกต้อง/ผิด, สิทธิ์แอดมิน, cancel ต้องไป adminCancelOrder
// ============================================================
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInAnonymously } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const PROJECT = 'demo-bocean';
const TID = 'demo';
let env, setStatus, auth, uid;

async function setAdminClaim(on) {
  await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:update', {
    method: 'POST',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ localId: uid, customAttributes: JSON.stringify(on ? { admin: true } : {}) }),
  });
  await auth.currentUser.getIdToken(true);
}

before(async () => {
  env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { host: '127.0.0.1', port: 8080 } });
  const app = initializeApp({ projectId: PROJECT, apiKey: 'fake-api-key' });
  auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const functions = getFunctions(app, 'asia-southeast1');
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  uid = (await signInAnonymously(auth)).user.uid;
  setStatus = (data) => httpsCallable(functions, 'setOrderStatus')(data).then((r) => r.data);
});
after(async () => { await env.cleanup(); });

async function seedOrder(status) {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `tenants/${TID}`), { status: 'active' });
    await setDoc(doc(db, `tenants/${TID}/orders/o1`), { status, userId: 'buyer', items: [], total: 100 });
  });
}
async function read(path) {
  let out;
  await env.withSecurityRulesDisabled(async (ctx) => { out = await getDoc(doc(ctx.firestore(), path)); });
  return out.data();
}
async function expectFail(data, code) {
  await assert.rejects(() => setStatus(data), (e) => {
    assert.match(String(e.code || ''), new RegExp(code + '$'), `code ควรลงท้าย ${code} แต่ได้ ${e.code}`);
    return true;
  });
}

// ── สิทธิ์ ──
test('ไม่ใช่แอดมิน → permission-denied', async () => {
  await setAdminClaim(false);
  await seedOrder('paid_review');
  await expectFail({ tid: TID, orderId: 'o1', to: 'confirmed' }, 'permission-denied');
});

// ── transition ที่ถูกต้อง ──
test('paid_review → confirmed (ok, ตั้ง confirmedAt)', async () => {
  await setAdminClaim(true);
  await seedOrder('paid_review');
  const r = await setStatus({ tid: TID, orderId: 'o1', to: 'confirmed' });
  assert.equal(r.to, 'confirmed');
  const o = await read(`tenants/${TID}/orders/o1`);
  assert.equal(o.status, 'confirmed');
  assert.ok(o.confirmedAt, 'ต้องตั้ง confirmedAt');
});
test('confirmed → shipped + trackingNumber (ok)', async () => {
  await setAdminClaim(true);
  await seedOrder('confirmed');
  await setStatus({ tid: TID, orderId: 'o1', to: 'shipped', trackingNumber: 'TH123' });
  const o = await read(`tenants/${TID}/orders/o1`);
  assert.equal(o.status, 'shipped');
  assert.equal(o.trackingNumber, 'TH123');
});
test('shipped → completed (ok)', async () => {
  await setAdminClaim(true);
  await seedOrder('shipped');
  await setStatus({ tid: TID, orderId: 'o1', to: 'completed' });
  assert.equal((await read(`tenants/${TID}/orders/o1`)).status, 'completed');
});

// ── transition ที่ผิด → failed-precondition ──
test('pending_payment → shipped (ข้ามขั้น) = failed-precondition', async () => {
  await setAdminClaim(true);
  await seedOrder('pending_payment');
  await expectFail({ tid: TID, orderId: 'o1', to: 'shipped' }, 'failed-precondition');
  assert.equal((await read(`tenants/${TID}/orders/o1`)).status, 'pending_payment', 'status ต้องไม่เปลี่ยน');
});
test('confirmed → completed (ข้าม shipped) = failed-precondition', async () => {
  await setAdminClaim(true);
  await seedOrder('confirmed');
  await expectFail({ tid: TID, orderId: 'o1', to: 'completed' }, 'failed-precondition');
});
test('completed → shipped (terminal) = failed-precondition', async () => {
  await setAdminClaim(true);
  await seedOrder('completed');
  await expectFail({ tid: TID, orderId: 'o1', to: 'shipped' }, 'failed-precondition');
});

// ── กรณีพิเศษ ──
test("to='cancelled' → failed-precondition (ให้ไป adminCancelOrder)", async () => {
  await setAdminClaim(true);
  await seedOrder('confirmed');
  await expectFail({ tid: TID, orderId: 'o1', to: 'cancelled' }, 'failed-precondition');
});
test("to ไม่ถูกต้อง → invalid-argument", async () => {
  await setAdminClaim(true);
  await seedOrder('confirmed');
  await expectFail({ tid: TID, orderId: 'o1', to: 'bogus' }, 'invalid-argument');
});
test('order ไม่มีจริง → not-found', async () => {
  await setAdminClaim(true);
  await seedOrder('confirmed');
  await expectFail({ tid: TID, orderId: 'ไม่มี', to: 'shipped' }, 'not-found');
});

// ── B2 step3: →confirmed ลด openOrders ของเจ้าของ ──
test('B2 step3: →confirmed ลด openOrders ของเจ้าของ', async () => {
  await setAdminClaim(true);
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `tenants/${TID}`), { status: 'active' });
    await setDoc(doc(db, `tenants/${TID}/orders/o1`), { status: 'paid_review', userId: 'buyer', items: [], total: 100 });
    await setDoc(doc(db, `tenants/${TID}/users/buyer`), { openOrders: 2 });
  });
  await setStatus({ tid: TID, orderId: 'o1', to: 'confirmed' });
  assert.equal((await read(`tenants/${TID}/users/buyer`)).openOrders, 1, 'confirm ต้องลด openOrders');
});
