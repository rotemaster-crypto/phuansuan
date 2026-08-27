// ============================================================
//  submitVerification (N5 stage ③) — e2e ผ่าน emulator
//  รัน:
//    firebase emulators:exec --only functions,firestore,auth --project demo-bocean \
//      "node --test tests/verify.test.js"
//  ล็อก: เจ้าของร้าน (tadmin[tid]) ส่งเอกสาร+บัญชี → private/verification=pending
//        · path เอกสารต้องอยู่ใต้ verifications/{tid}/ · ค่าไม่ครบ = ปฏิเสธ
// ============================================================
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInAnonymously } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc } from 'firebase/firestore';

const PROJECT = 'demo-bocean';
let env, auth, createShop, submitVerification;

const SHOP = {
  name: 'ร้านยืนยันตัวตน', ownerName: 'สมหญิง จริงใจ', phone: '0812345678',
  email: 'v@example.com', category: 'beauty', promptpayId: '0812345678', acceptedTerms: true,
};

before(async () => {
  env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { host: '127.0.0.1', port: 8080 } });
  const app = initializeApp({ projectId: PROJECT, apiKey: 'fake-api-key' });
  auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const functions = getFunctions(app, 'asia-southeast1');
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  await signInAnonymously(auth);
  createShop = (data) => httpsCallable(functions, 'createShop')(data).then((r) => r.data);
  submitVerification = (data) => httpsCallable(functions, 'submitVerification')(data).then((r) => r.data);
});
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

async function read(path) {
  let out;
  await env.withSecurityRulesDisabled(async (ctx) => { out = await getDoc(doc(ctx.firestore(), path)); });
  return out;
}
// เปิดร้าน แล้ว refresh token เพื่อรับ claim tadmin[tid] (createShop setCustomUserClaims)
async function openShopAndRefresh() {
  const res = await createShop(SHOP);
  await auth.currentUser.getIdToken(true);
  return res.tid;
}
function docs(tid) {
  return { idCard: `verifications/${tid}/id.jpg`, selfie: `verifications/${tid}/selfie.jpg`, registration: '' };
}
const BANK = { bankName: 'สมหญิง จริงใจ', bankNumber: '0812345678', bankType: 'promptpay' };

test('ส่งเอกสาร+บัญชี → private/verification = pending (เจ้าของอ่านสถานะได้)', async () => {
  const tid = await openShopAndRefresh();
  const res = await submitVerification({ tid, docs: docs(tid), ...BANK });
  assert.equal(res.ok, true);
  assert.equal(res.status, 'pending');

  const v = await read(`tenants/${tid}/private/verification`);
  assert.ok(v.exists);
  assert.equal(v.data().status, 'pending');
  assert.equal(v.data().bankAccount.name, BANK.bankName, 'ชื่อบัญชีเก็บไว้ให้ super-admin เทียบกับเอกสาร');
  assert.equal(v.data().docs.idCard, docs(tid).idCard);
});

test('ไม่แนบบัตร → invalid-argument', async () => {
  const tid = await openShopAndRefresh();
  await assert.rejects(
    () => submitVerification({ tid, docs: { idCard: '', selfie: docs(tid).selfie }, ...BANK }),
    (e) => (assert.match(String(e.code || ''), /invalid-argument$/), true));
});

test('path เอกสารไม่อยู่ใต้ verifications/{tid}/ → invalid-argument (กันแนบร้านอื่น)', async () => {
  const tid = await openShopAndRefresh();
  await assert.rejects(
    () => submitVerification({ tid, docs: { idCard: 'verifications/other-shop/id.jpg', selfie: docs(tid).selfie }, ...BANK }),
    (e) => (assert.match(String(e.code || ''), /invalid-argument$/), true));
});

test('ชื่อบัญชีสั้นเกิน → invalid-argument', async () => {
  const tid = await openShopAndRefresh();
  await assert.rejects(
    () => submitVerification({ tid, docs: docs(tid), bankName: 'x', bankNumber: '0812345678' }),
    (e) => (assert.match(String(e.code || ''), /invalid-argument$/), true));
});
