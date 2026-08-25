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

// ข้อมูลผู้รับ/ผู้ส่งครบ (สำหรับทดสอบโหมดจริงผ่าน preflight)
const FULL_SHIP  = { name:'สมชาย', phone:'0812345678', addressLine:'123 ม.4', subdistrict:'บางรัก', district:'บางรัก', province:'กรุงเทพ', postcode:'10500' };
const FULL_STORE = { name:'ร้านเพื่อนสวน', phone:'0898765432', addressLine:'99 ถ.สุขุมวิท', subdistrict:'คลองเตย', district:'คลองเตย', province:'กรุงเทพ', postcode:'10110' };
const REAL_ORDER = { userId: 'x', status:'confirmed', total:300, weight:1.5, shipping: FULL_SHIP };

async function seed(courierCfg, order, secret, store) {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `tenants/${TID}`), { status: 'active' });
    if (courierCfg) await setDoc(doc(db, `tenants/${TID}/settings/courier`), courierCfg);
    if (secret) await setDoc(doc(db, `tenants/${TID}/private/courier`), secret);
    if (store) await setDoc(doc(db, `tenants/${TID}/settings/store`), store);
    await setDoc(doc(db, `tenants/${TID}/orders/o1`), order || { userId: uid, status: 'confirmed', total: 300 });
  });
}
async function read(path) { let o; await env.withSecurityRulesDisabled(async (ctx) => { o = await getDoc(doc(ctx.firestore(), path)); }); return o.exists ? o.data() : null; }
async function expectFail(fn, data, code) { await assert.rejects(() => fn(data), (e) => { assert.match(String(e.code||''), new RegExp(code+'$')); return true; }); }
async function expectFailMsg(fn, data, code, msgRe) { await assert.rejects(() => fn(data), (e) => { assert.match(String(e.code||''), new RegExp(code+'$')); assert.match(String(e.message||''), msgRe); return true; }); }

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

// ── โหมดจริง + ข้อมูลครบ → ผ่าน preflight ถึง unimplemented (รอเสียบ API) ──
test('โหมดจริง + ข้อมูลครบ → unimplemented (ผ่าน preflight)', async () => {
  await setAdminClaim(true);
  await seed({ active: true, mock: false, provider: 'shippop' }, REAL_ORDER, { provider:'shippop', apiKey:'REALKEY' }, FULL_STORE);
  await expectFail(ship, { tid: TID, orderId: 'o1' }, 'unimplemented');
});

// ── preflight: โหมดจริง + ผู้รับไม่ครบ → failed-precondition + บอกว่าขาดอะไร ──
test('preflight: ผู้รับไม่ครบ → failed-precondition (ระบุที่ขาด)', async () => {
  await setAdminClaim(true);
  const noShip = { userId: uid, status:'confirmed', total:300, weight:1.5 };  // ไม่มี shipping
  await seed({ active: true, mock: false, provider: 'shippop' }, noShip, { provider:'shippop', apiKey:'REALKEY' }, FULL_STORE);
  await expectFailMsg(ship, { tid: TID, orderId: 'o1' }, 'failed-precondition', /ผู้รับ/);
});

// ── preflight: ไม่มีข้อมูลร้าน (ผู้ส่ง) → failed-precondition ──
test('preflight: ไม่มีข้อมูลร้าน → failed-precondition (ระบุผู้ส่ง)', async () => {
  await setAdminClaim(true);
  await seed({ active: true, mock: false, provider: 'shippop' }, REAL_ORDER, { provider:'shippop', apiKey:'REALKEY' });  // ไม่ seed store
  await expectFailMsg(ship, { tid: TID, orderId: 'o1' }, 'failed-precondition', /ร้าน|ผู้ส่ง/);
});

// ── preflight: ไม่มีน้ำหนัก → failed-precondition ──
test('preflight: ไม่มีน้ำหนัก → failed-precondition', async () => {
  await setAdminClaim(true);
  const noWeight = { userId: uid, status:'confirmed', total:300, shipping: FULL_SHIP };  // weight ไม่มี
  await seed({ active: true, mock: false, provider: 'shippop' }, noWeight, { provider:'shippop', apiKey:'REALKEY' }, FULL_STORE);
  await expectFailMsg(ship, { tid: TID, orderId: 'o1' }, 'failed-precondition', /น้ำหนัก/);
});

// ── preflight: รหัสไปรษณีย์ผิดรูป (ไม่ใช่ 5 หลัก) → failed-precondition ──
test('preflight: รหัสไปรษณีย์ผู้รับผิดรูป → failed-precondition', async () => {
  await setAdminClaim(true);
  const badZip = { userId: uid, status:'confirmed', total:300, weight:1.5, shipping: Object.assign({}, FULL_SHIP, { postcode:'105' }) };
  await seed({ active: true, mock: false, provider: 'shippop' }, badZip, { provider:'shippop', apiKey:'REALKEY' }, FULL_STORE);
  await expectFailMsg(ship, { tid: TID, orderId: 'o1' }, 'failed-precondition', /รหัสไปรษณีย์/);
});

// ── โหมดทดสอบ ข้าม preflight ได้ (ข้อมูลไม่ครบก็ยัง MOCK สำเร็จ) ──
test('mock mode → ข้าม preflight (ข้อมูลไม่ครบก็สร้าง MOCK ได้)', async () => {
  await setAdminClaim(true);
  await seed({ active: true, mock: true }, { userId: uid, status:'confirmed', total:300 });  // ไม่มี shipping/store/weight
  const res = await ship({ tid: TID, orderId: 'o1', courier: 'flash' });
  assert.equal(res.mock, true);
  assert.match(res.trackingNumber, /^MOCK-/);
});

// ── สิทธิ์: ไม่ใช่แอดมิน → permission-denied ──
test('ไม่ใช่แอดมิน → permission-denied', async () => {
  await setAdminClaim(false);
  await seed({ active: true, mock: true }, { userId: uid, status: 'confirmed', total: 300 });
  await expectFail(ship, { tid: TID, orderId: 'o1' }, 'permission-denied');
});
