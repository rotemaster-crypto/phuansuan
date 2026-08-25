// ============================================================
//  createShipment + setCourierCredential — e2e ผ่าน emulator (เชื่อมขนส่ง)
//  รัน (serial):
//    firebase emulators:exec --only functions,firestore,auth --project demo-bocean \
//      "node --test --test-concurrency=1 tests/spin.test.js tests/place.test.js tests/cancel.test.js tests/mission.test.js tests/prediction.test.js tests/courier.test.js"
//  ทดสอบ: เก็บ key, สร้างเลขพัสดุโหมดทดสอบ, guard (ปิดใช้/มีเลขแล้ว), โหมดจริง=unimplemented, สิทธิ์
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
let env, auth, uid, setCred, ship;

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
  setCred = (d) => httpsCallable(functions, 'setCourierCredential')(d).then((r) => r.data);
  ship = (d) => httpsCallable(functions, 'createShipment')(d).then((r) => r.data);
});
after(async () => { await env.cleanup(); });

async function seed(courierCfg, order, secret) {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `tenants/${TID}`), { status: 'active' });
    if (courierCfg) await setDoc(doc(db, `tenants/${TID}/settings/courier`), courierCfg);
    if (secret) await setDoc(doc(db, `tenants/${TID}/private/courier`), secret);
    await setDoc(doc(db, `tenants/${TID}/orders/o1`), order || { userId: uid, status: 'confirmed', total: 300 });
  });
}
async function read(path) { let o; await env.withSecurityRulesDisabled(async (ctx) => { o = await getDoc(doc(ctx.firestore(), path)); }); return o.exists ? o.data() : null; }
async function expectFail(fn, data, code) { await assert.rejects(() => fn(data), (e) => { assert.match(String(e.code||''), new RegExp(code+'$')); return true; }); }

// ── setCourierCredential เก็บ key (client อ่านไม่ได้ผ่าน rules แต่ function เขียนได้) ──
test('setCourierCredential → เก็บ private/courier', async () => {
  await setAdminClaim(true);
  await seed({ active: true, mock: true }, { userId: uid, status: 'confirmed', total: 300 });
  const res = await setCred({ tid: TID, provider: 'shippop', apiKey: 'KEY123' });
  assert.equal(res.hasKey, true);
  const sec = await read(`tenants/${TID}/private/courier`);
  assert.equal(sec.provider, 'shippop'); assert.equal(sec.apiKey, 'KEY123');
});

// ── โหมดทดสอบ: สร้างเลขพัสดุจำลอง + สถานะ shipped ──
test('mock mode → เลขพัสดุ MOCK + status shipped', async () => {
  await setAdminClaim(true);
  await seed({ active: true, mock: true }, { userId: uid, status: 'confirmed', total: 300 });
  const res = await ship({ tid: TID, orderId: 'o1', courier: 'kerry' });
  assert.equal(res.mock, true);
  assert.match(res.trackingNumber, /^MOCK-/);
  const o = await read(`tenants/${TID}/orders/o1`);
  assert.equal(o.status, 'shipped');
  assert.equal(o.trackingNumber, res.trackingNumber);
  assert.equal(o.courier, 'kerry');
});

// ── ยังไม่เปิดใช้ → failed-precondition ──
test('ยังไม่เปิดใช้ระบบขนส่ง → failed-precondition', async () => {
  await setAdminClaim(true);
  await seed({ active: false, mock: true }, { userId: uid, status: 'confirmed', total: 300 });
  await expectFail(ship, { tid: TID, orderId: 'o1' }, 'failed-precondition');
});

// ── มีเลขพัสดุแล้ว → failed-precondition (กันซ้ำ) ──
test('มีเลขพัสดุแล้ว → failed-precondition', async () => {
  await setAdminClaim(true);
  await seed({ active: true, mock: true }, { userId: uid, status: 'shipped', total: 300, trackingNumber: 'ABC123' });
  await expectFail(ship, { tid: TID, orderId: 'o1' }, 'failed-precondition');
});

// ── โหมดจริง (มี key, ปิด mock) → unimplemented (รอเสียบ API) ──
test('โหมดจริง (มี key, ปิด mock) → unimplemented', async () => {
  await setAdminClaim(true);
  await seed({ active: true, mock: false, provider: 'shippop' }, { userId: uid, status: 'confirmed', total: 300 }, { provider:'shippop', apiKey:'REALKEY' });
  await expectFail(ship, { tid: TID, orderId: 'o1' }, 'unimplemented');
});

// ── สิทธิ์: ไม่ใช่แอดมิน → permission-denied ──
test('ไม่ใช่แอดมิน → permission-denied', async () => {
  await setAdminClaim(false);
  await seed({ active: true, mock: true }, { userId: uid, status: 'confirmed', total: 300 });
  await expectFail(ship, { tid: TID, orderId: 'o1' }, 'permission-denied');
});
