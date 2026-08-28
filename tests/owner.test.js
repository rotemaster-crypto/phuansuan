// ============================================================
//  transferOwnership — e2e ผ่าน emulator (functions+firestore+auth)
//  รัน (serial):
//    firebase emulators:exec --only functions,firestore,auth --project demo-bocean \
//      "node --test --test-concurrency=1 tests/owner.test.js"
//  ล็อกพฤติกรรมโอนเจ้าของร้าน (server-authoritative):
//   - เฉพาะเจ้าของปัจจุบัน (towner[tid]) หรือ super-admin (admin) โอนได้
//   - ผู้รับต้องเป็นแอดมินร่วมอยู่แล้ว (adminLineIds) — กันโอนให้คนนอก
//   - สำเร็จ → tenant.ownerLineId = ผู้รับ + ยังอยู่ใน adminLineIds
//   - LINE id ผู้รับผิดรูปแบบ / เป็นเจ้าของอยู่แล้ว = ปฏิเสธ (fail-safe)
// ============================================================
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInAnonymously } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const PROJECT = 'demo-bocean';
let env, auth, uid, transfer;
const NEWOWNER = 'U0123456789abcdef0123456789abcdef';   // 32 hex — รูปแบบ LINE User ID
const OTHER = 'Uffffffffffffffffffffffffffffffff';

// เซ็ต custom claims ให้ caller (uid) ผ่าน Identity Toolkit REST แล้ว refresh token
async function setClaims(obj) {
  await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:update', {
    method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ localId: uid, customAttributes: JSON.stringify(obj || {}) }),
  });
  await auth.currentUser.getIdToken(true);
}
async function seedTenant(tid, owner, admins) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `tenants/${tid}`),
      { name: 'ร้าน ' + tid, status: 'active', ownerLineId: owner, adminLineIds: admins });
  });
}
async function read(path) {
  let out;
  await env.withSecurityRulesDisabled(async (ctx) => { out = await getDoc(doc(ctx.firestore(), path)); });
  return out;
}
function rejectsCode(fn, suffix) {
  return assert.rejects(fn, (e) => {
    assert.match(String(e.code || ''), new RegExp(suffix + '$'), `code ควรลงท้าย ${suffix} แต่ได้ ${e.code}`);
    return true;
  });
}

before(async () => {
  env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { host: '127.0.0.1', port: 8080 } });
  const app = initializeApp({ projectId: PROJECT, apiKey: 'fake-api-key' });
  auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const functions = getFunctions(app, 'asia-southeast1');
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  uid = (await signInAnonymously(auth)).user.uid;
  transfer = (d) => httpsCallable(functions, 'transferOwnership')(d).then((r) => r.data);
});
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

test('เจ้าของโอนให้แอดมินร่วม → ownerLineId เปลี่ยน + ผู้รับยังอยู่ใน adminLineIds', async () => {
  await seedTenant('own1', uid, [uid, NEWOWNER]);
  await setClaims({ towner: { own1: true }, tadmin: { own1: true } });
  const res = await transfer({ tid: 'own1', newOwnerLineId: NEWOWNER });
  assert.equal(res.ok, true);
  assert.equal(res.newOwnerLineId, NEWOWNER);
  assert.equal(res.previousOwnerLineId, uid);

  const t = await read('tenants/own1');
  assert.equal(t.data().ownerLineId, NEWOWNER, 'ownerLineId = ผู้รับโอน (source of truth ให้ lineAuth ออก towner)');
  assert.ok((t.data().adminLineIds || []).includes(NEWOWNER), 'ผู้รับยังเป็นแอดมินร่วม');
});

test('super-admin โอนแทนได้ (ไม่ต้องเป็นเจ้าของ)', async () => {
  await seedTenant('own6', OTHER, [OTHER, NEWOWNER]);
  await setClaims({ admin: true });
  const res = await transfer({ tid: 'own6', newOwnerLineId: NEWOWNER });
  assert.equal(res.ok, true);
  assert.equal(res.previousOwnerLineId, OTHER);
  const t = await read('tenants/own6');
  assert.equal(t.data().ownerLineId, NEWOWNER);
});

test('ไม่ใช่เจ้าของ/super → permission-denied', async () => {
  await seedTenant('own2', OTHER, [OTHER, NEWOWNER]);
  await setClaims({});   // caller ไม่มีสิทธิ์อะไรกับร้านนี้
  await rejectsCode(() => transfer({ tid: 'own2', newOwnerLineId: NEWOWNER }), 'permission-denied');
});

test('ผู้รับยังไม่เป็นแอดมินร่วม → failed-precondition (กันโอนให้คนนอก)', async () => {
  await seedTenant('own3', uid, [uid]);
  await setClaims({ towner: { own3: true } });
  await rejectsCode(() => transfer({ tid: 'own3', newOwnerLineId: NEWOWNER }), 'failed-precondition');
});

test('LINE id ผู้รับผิดรูปแบบ → invalid-argument', async () => {
  await seedTenant('own4', uid, [uid]);
  await setClaims({ towner: { own4: true } });
  await rejectsCode(() => transfer({ tid: 'own4', newOwnerLineId: 'not-a-line-id' }), 'invalid-argument');
});

test('ผู้รับเป็นเจ้าของอยู่แล้ว → failed-precondition', async () => {
  await seedTenant('own5', NEWOWNER, [NEWOWNER, uid]);
  await setClaims({ admin: true });
  await rejectsCode(() => transfer({ tid: 'own5', newOwnerLineId: NEWOWNER }), 'failed-precondition');
});
