// ============================================================
//  createShop (N5 stage ①) — e2e ผ่าน emulator (functions+firestore+auth)
//  รัน:
//    firebase emulators:exec --only functions,firestore,auth --project demo-bocean \
//      "node --test tests/shop.test.js"
//  ล็อกพฤติกรรม self-service เปิดร้าน:
//   - เปิดได้ทันที (status active, verified:false) โดยไม่ต้องรอ admin
//   - PII เจ้าของอยู่ private/owner (ไม่อยู่บน tenant doc — A8)
//   - validate ชุด "มาตรฐาน" fail-safe (ค่าไม่ครบ = ปฏิเสธ ไม่เดา)
// ============================================================
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInAnonymously } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc } from 'firebase/firestore';

const PROJECT = 'demo-bocean';
let env, createShop, uid;

const VALID = {
  name: 'ร้านทดสอบ Bocean',
  ownerName: 'สมชาย ใจดี',
  phone: '0868834583',
  email: 'shop@example.com',
  category: 'fashion',
  promptpayId: '0868834583',
  store: { addressLine: '123 ถนนสวน', subdistrict: 'ในเมือง', district: 'เมือง', province: 'เชียงใหม่', postcode: '50000' },
  acceptedTerms: true,
};

before(async () => {
  env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { host: '127.0.0.1', port: 8080 } });
  const app = initializeApp({ projectId: PROJECT, apiKey: 'fake-api-key' });
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const functions = getFunctions(app, 'asia-southeast1');
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  const cred = await signInAnonymously(auth);
  uid = cred.user.uid;
  createShop = (data) => httpsCallable(functions, 'createShop')(data).then((r) => r.data);
});
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

async function read(path) {
  let out;
  await env.withSecurityRulesDisabled(async (ctx) => { out = await getDoc(doc(ctx.firestore(), path)); });
  return out;
}
async function expectReject(data, codeSuffix) {
  await assert.rejects(() => createShop(data), (e) => {
    assert.match(String(e.code || ''), new RegExp(codeSuffix + '$'), `code ควรลงท้าย ${codeSuffix} แต่ได้ ${e.code}`);
    return true;
  });
}

test('เปิดร้านสำเร็จ → tenant active + verified:false + PII อยู่ private (ไม่อยู่บน tenant doc)', async () => {
  const res = await createShop(VALID);
  assert.equal(res.ok, true);
  assert.ok(res.tid && res.tid.length > 0, 'ต้องคืน tid');

  const t = await read(`tenants/${res.tid}`);
  assert.ok(t.exists, 'tenant doc ต้องถูกสร้าง');
  const td = t.data();
  assert.equal(td.status, 'active', 'เปิดได้ทันที');
  assert.equal(td.verified, false, 'ยังไม่ verified');
  assert.equal(td.ownerLineId, uid, 'ownerLineId = ผู้เปิด (ให้ lineAuth ออก towner)');
  assert.deepEqual(td.adminLineIds, [uid]);
  assert.equal(td.name, VALID.name);
  assert.equal(td.email, undefined, 'อีเมล (PII) ต้องไม่อยู่บน tenant doc');
  assert.equal(td.ownerName, undefined, 'ชื่อจริง (PII) ต้องไม่อยู่บน tenant doc');

  const priv = await read(`tenants/${res.tid}/private/owner`);
  assert.ok(priv.exists, 'private/owner ต้องถูกสร้าง');
  assert.equal(priv.data().ownerName, VALID.ownerName);
  assert.equal(priv.data().email, VALID.email);

  const com = await read(`tenants/${res.tid}/settings/commerce`);
  assert.equal(com.data().promptpayId, VALID.promptpayId, 'พร้อมเพย์ไปอยู่ settings/commerce (ใช้รับเงิน)');
});

test('เปิด 2 ร้าน → ได้ tid ไม่ซ้ำกัน', async () => {
  const a = await createShop(VALID);
  const b = await createShop(VALID);
  assert.notEqual(a.tid, b.tid, 'tid ต้องไม่ชนกัน');
});

test('ไม่มีชื่อเจ้าของ → invalid-argument', async () => {
  await expectReject({ ...VALID, ownerName: '' }, 'invalid-argument');
});
test('อีเมลผิด → invalid-argument', async () => {
  await expectReject({ ...VALID, email: 'not-an-email' }, 'invalid-argument');
});
test('เบอร์โทรผิด → invalid-argument', async () => {
  await expectReject({ ...VALID, phone: 'abc' }, 'invalid-argument');
});
test('พร้อมเพย์/บัญชีผิด → invalid-argument', async () => {
  await expectReject({ ...VALID, promptpayId: '12' }, 'invalid-argument');
});
test('ไม่ยอมรับข้อตกลง → invalid-argument', async () => {
  await expectReject({ ...VALID, acceptedTerms: false }, 'invalid-argument');
});
test('ไม่เลือกหมวด → invalid-argument', async () => {
  await expectReject({ ...VALID, category: '' }, 'invalid-argument');
});
