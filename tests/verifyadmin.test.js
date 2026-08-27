// ============================================================
//  setTenantVerified + listPendingVerifications (N5 stage ④) — e2e
//  รัน (serial):
//    firebase emulators:exec --only functions,firestore,auth --project demo-bocean \
//      "node --test --test-concurrency=1 tests/verifyadmin.test.js"
//  ล็อก: super-admin อนุมัติ/ปฏิเสธ → tenant.verified + settings/app.verified (public badge)
//        + private/verification.status · ผู้ที่ไม่ใช่ super-admin = ปฏิเสธ
// ============================================================
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInAnonymously } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const PROJECT = 'demo-bocean';
let env, auth, uid, setVerified, listPending;

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
  setVerified = (d) => httpsCallable(functions, 'setTenantVerified')(d).then((r) => r.data);
  listPending = (d) => httpsCallable(functions, 'listPendingVerifications')(d).then((r) => r.data);
});
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

async function read(path) {
  let out;
  await env.withSecurityRulesDisabled(async (ctx) => { out = await getDoc(doc(ctx.firestore(), path)); });
  return out;
}
async function seedPending(tid) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `tenants/${tid}`), { name: 'ร้าน ' + tid, status: 'active', verified: false });
    await setDoc(doc(db, `tenants/${tid}/private/verification`), {
      status: 'pending',
      bankAccount: { name: 'สมชาย ใจดี', number: '0868834583', type: 'promptpay' },
      docs: { idCard: `verifications/${tid}/id.jpg`, selfie: `verifications/${tid}/selfie.jpg`, registration: '' },
    });
  });
}

test('อนุมัติ → tenant.verified + settings/app.verified (public) + status approved', async () => {
  await seedPending('shopa');
  await setAdminClaim(true);
  const res = await setVerified({ tid: 'shopa', approve: true, note: 'เอกสารครบ' });
  assert.equal(res.verified, true);

  const t = await read('tenants/shopa');
  assert.equal(t.data().verified, true, 'tenant.verified');
  const app = await read('tenants/shopa/settings/app');
  assert.equal(app.data().verified, true, 'settings/app.verified = flag public ให้ badge โผล่');
  const v = await read('tenants/shopa/private/verification');
  assert.equal(v.data().status, 'approved');
  assert.equal(v.data().reviewedBy, uid);
});

test('ปฏิเสธ → verified:false + status rejected + เก็บเหตุผล', async () => {
  await seedPending('shopb');
  await setAdminClaim(true);
  await setVerified({ tid: 'shopb', approve: false, note: 'รูปบัตรไม่ชัด' });
  const t = await read('tenants/shopb');
  assert.equal(t.data().verified, false);
  const v = await read('tenants/shopb/private/verification');
  assert.equal(v.data().status, 'rejected');
  assert.equal(v.data().reviewNote, 'รูปบัตรไม่ชัด');
});

test('listPendingVerifications → คืนเฉพาะร้านที่ pending พร้อมข้อมูล', async () => {
  await seedPending('p1');
  await seedPending('p2');
  await setAdminClaim(true);
  await setVerified({ tid: 'p2', approve: true });   // p2 อนุมัติแล้ว → ไม่ควรอยู่ในคิว
  const res = await listPending({});
  const tids = res.pending.map((x) => x.tid).sort();
  assert.deepEqual(tids, ['p1'], 'เหลือเฉพาะ p1 ที่ยัง pending');
  assert.equal(res.pending[0].bankAccount.name, 'สมชาย ใจดี');
  assert.ok(res.pending[0].docs.idCard.indexOf('verifications/p1/') === 0);
});

test('ไม่ใช่ super-admin → permission-denied', async () => {
  await seedPending('shopc');
  await setAdminClaim(false);
  await assert.rejects(() => setVerified({ tid: 'shopc', approve: true }),
    (e) => (assert.match(String(e.code || ''), /permission-denied$/), true));
});
