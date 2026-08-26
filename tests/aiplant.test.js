// ============================================================
//  analyzePlant — โควต้ารายวัน (B9) e2e ผ่าน emulator
//  รัน: firebase emulators:exec --only functions,firestore,auth --project demo-bocean \
//         "node --test tests/aiplant.test.js"
//  ทดสอบเฉพาะ "การจองโควต้า" (reserve-before-call) — ปฏิเสธเมื่อเกินโควต้า
//  ก่อนแตะ Gemini (path นี้ไม่เรียก external จึง deterministic ไม่ต้อง mock)
//  หมายเหตุ: success path เรียก Gemini จริง → ไม่ได้ทดสอบที่นี่ (ไม่มี mock)
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
let env, analyze, uid;
const today = () => new Date().toISOString().slice(0, 10);

before(async () => {
  env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { host: '127.0.0.1', port: 8080 } });
  const app = initializeApp({ projectId: PROJECT, apiKey: 'fake-api-key' });
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const functions = getFunctions(app, 'asia-southeast1');
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  uid = (await signInAnonymously(auth)).user.uid;
  analyze = (data) => httpsCallable(functions, 'analyzePlant')(data).then((r) => r.data);
});
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

async function seed(count) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `tenants/${TID}`), { status: 'active' });
    await setDoc(doc(db, `tenants/${TID}/users/${uid}`), { points: 0 });
    if (count !== undefined) await setDoc(doc(db, `tenants/${TID}/users/${uid}/aiUsage/${today()}`), { count });
  });
}
async function read(path) {
  let out;
  await env.withSecurityRulesDisabled(async (ctx) => { out = await getDoc(doc(ctx.firestore(), path)); });
  return out.exists() ? out.data() : null;
}

test('B9: เกินโควต้ารายวัน → resource-exhausted (ปฏิเสธก่อนเรียก Gemini)', async () => {
  await seed(999);   // 999 >= โควต้าใด ๆ
  await assert.rejects(
    () => analyze({ tid: TID, imageBase64: 'ZmFrZQ==', cropName: 'ทดสอบ' }),
    (e) => { assert.match(String(e.code || ''), /resource-exhausted$/); return true; }
  );
  // ปฏิเสธก่อน reserve → count ต้องไม่ขยับ (ไม่กินโควต้า/ไม่เรียก Gemini)
  const q = await read(`tenants/${TID}/users/${uid}/aiUsage/${today()}`);
  assert.equal(q.count, 999);
});

test('B9: ไม่ส่งรูป → invalid-argument (ก่อนแตะโควต้า)', async () => {
  await seed(0);
  await assert.rejects(
    () => analyze({ tid: TID, cropName: 'ทดสอบ' }),
    (e) => { assert.match(String(e.code || ''), /invalid-argument$/); return true; }
  );
});
