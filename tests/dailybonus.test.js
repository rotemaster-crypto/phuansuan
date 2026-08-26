// ============================================================
//  dailyLoginBonus — e2e ผ่าน emulator (functions + firestore + auth)
//  รันด้วย:
//    firebase emulators:exec --only functions,firestore,auth --project demo-bocean \
//      "node --test tests/dailybonus.test.js"
//  A5: โบนัสเข้าระบบรายวันย้ายมาคิดฝั่ง server (idempotent ต่อวัน) แทน client
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
let env, bonus, uid;

before(async () => {
  env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { host: '127.0.0.1', port: 8080 } });
  const app = initializeApp({ projectId: PROJECT, apiKey: 'fake-api-key' });
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const functions = getFunctions(app, 'asia-southeast1');
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  uid = (await signInAnonymously(auth)).user.uid;
  bonus = (data) => httpsCallable(functions, 'dailyLoginBonus')(data).then((r) => r.data);
});
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

async function seedUser(points, extra) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `tenants/${TID}`), { status: 'active' });
    await setDoc(doc(db, `tenants/${TID}/users/${uid}`), Object.assign({ points, tier: 'bronze' }, extra || {}));
  });
}
async function read(path) {
  let out;
  await env.withSecurityRulesDisabled(async (ctx) => { out = await getDoc(doc(ctx.firestore(), path)); });
  return out.data();
}

test('ครั้งแรกของวัน → ได้ +5 แต้ม + บันทึก lastBonusDay', async () => {
  await seedUser(0);
  const res = await bonus({ tid: TID });
  assert.equal(res.granted, 5);
  assert.equal(res.points, 5);
  const u = await read(`tenants/${TID}/users/${uid}`);
  assert.equal(u.points, 5);
  assert.ok(u.lastBonusDay, 'ต้องบันทึก lastBonusDay');
});

test('เรียกซ้ำในวันเดียวกัน → granted 0 (idempotent) แต้มไม่เพิ่ม', async () => {
  await seedUser(0);
  const r1 = await bonus({ tid: TID });
  assert.equal(r1.granted, 5);
  const r2 = await bonus({ tid: TID });
  assert.equal(r2.granted, 0, 'วันเดียวกันต้องไม่ให้ซ้ำ');
  const u = await read(`tenants/${TID}/users/${uid}`);
  assert.equal(u.points, 5, 'แต้มต้องเท่าเดิม ไม่โดนบวกซ้ำ');
});

test('user มีแต้มอยู่แล้ว 100 → +5 = 105', async () => {
  await seedUser(100);
  const res = await bonus({ tid: TID });
  assert.equal(res.points, 105);
});

test('ยังไม่มี user doc → failed-precondition', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `tenants/${TID}`), { status: 'active' });
  });
  await assert.rejects(() => bonus({ tid: TID }), (e) => {
    assert.match(String(e.code || ''), /failed-precondition$/);
    return true;
  });
});
