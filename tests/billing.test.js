// ============================================================
//  shippingBillingSummary + setShippingBillStatus — e2e ผ่าน emulator
//  (super-admin รวมต้นทุนค่าส่งต่อแบรนด์/เดือน + ทำเครื่องหมายชำระ)
//  รัน (serial): firebase emulators:exec --only functions,firestore,auth --project demo-bocean \
//    "node --test --test-concurrency=1 tests/billing.test.js"
// ============================================================
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInAnonymously } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';

const PROJECT = 'demo-bocean';
let env, auth, uid, summary, setStatus;

async function setAdminClaim(on) {
  await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:update', {
    method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
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
  summary = (d) => httpsCallable(functions, 'shippingBillingSummary')(d).then((r) => r.data);
  setStatus = (d) => httpsCallable(functions, 'setShippingBillStatus')(d).then((r) => r.data);
});
after(async () => { await env.cleanup(); });

const AUG = new Date(Date.UTC(2026, 7, 15));   // ในเดือน 2026-08
const JUL = new Date(Date.UTC(2026, 6, 15));   // นอกเดือน (2026-07)

async function seed() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'tenants/demo'),  { name: 'ร้านเดโม', status: 'active' });
    await setDoc(doc(db, 'tenants/demo2'), { name: 'ร้านสอง', status: 'active' });
    // demo: 2 พัสดุจริงในเดือน (39 + 27) + 1 mock (ไม่มี shippingPrice) + 1 นอกเดือน (99)
    await setDoc(doc(db, 'tenants/demo/orders/a'),  { status: 'shipped', total: 300, shippingPrice: 39, courier: 'FLE', trackingNumber: 'TH-A', shippedAt: AUG });
    await setDoc(doc(db, 'tenants/demo/orders/b'),  { status: 'shipped', total: 200, shippingPrice: 27, courier: 'DHL', trackingNumber: 'TH-B', shippedAt: AUG });
    await setDoc(doc(db, 'tenants/demo/orders/mk'), { status: 'shipped', total: 100, trackingNumber: 'MOCK-X', shippedAt: AUG });         // ไม่มี shippingPrice → ไม่นับ
    await setDoc(doc(db, 'tenants/demo/orders/old'),{ status: 'shipped', total: 500, shippingPrice: 99, courier: 'FLE', shippedAt: JUL });  // นอกเดือน → ไม่นับ
    // demo2: 1 พัสดุจริง (40)
    await setDoc(doc(db, 'tenants/demo2/orders/c'), { status: 'shipped', total: 150, shippingPrice: 40, courier: 'FLE', trackingNumber: 'TH-C', shippedAt: AUG });
  });
}

test('summary → รวมต่อแบรนด์ถูกต้อง (ตัด mock + นอกเดือน)', async () => {
  await setAdminClaim(true);
  await seed();
  const res = await summary({ month: '2026-08' });
  assert.equal(res.month, '2026-08');
  assert.equal(res.grandCount, 3);            // a,b (demo) + c (demo2)
  assert.equal(res.grandTotal, 106);          // 39+27+40
  const demo = res.brands.find((b) => b.tid === 'demo');
  assert.equal(demo.count, 2);
  assert.equal(demo.total, 66);
  assert.equal(demo.status, 'unpaid');
  assert.equal(demo.orders.length, 2);
  assert.ok(res.brands.some((b) => b.tid === 'demo2' && b.total === 40));
});

test('setShippingBillStatus → paid แล้ว summary โชว์ paid', async () => {
  await setAdminClaim(true);
  await seed();
  const r = await setStatus({ month: '2026-08', tid: 'demo', status: 'paid', amount: 66, count: 2 });
  assert.equal(r.ok, true);
  const res = await summary({ month: '2026-08' });
  const demo = res.brands.find((b) => b.tid === 'demo');
  assert.equal(demo.status, 'paid');
  assert.ok(demo.paidAt);
});

test('setShippingBillStatus: status ผิด → invalid-argument', async () => {
  await setAdminClaim(true);
  await assert.rejects(() => setStatus({ month: '2026-08', tid: 'demo', status: 'xxx' }),
    (e) => { assert.match(String(e.code || ''), /invalid-argument$/); return true; });
});

test('ไม่ใช่ super-admin → permission-denied', async () => {
  await setAdminClaim(false);
  await assert.rejects(() => summary({ month: '2026-08' }),
    (e) => { assert.match(String(e.code || ''), /permission-denied$/); return true; });
});
