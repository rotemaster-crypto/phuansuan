// ============================================================
//  submitPrediction + settlePrediction — e2e ผ่าน emulator (ทายผล)
//  รัน (serial):
//    firebase emulators:exec --only functions,firestore,auth --project demo-bocean \
//      "node --test --test-concurrency=1 tests/spin.test.js tests/place.test.js tests/cancel.test.js tests/mission.test.js tests/prediction.test.js"
//  ทดสอบ: ส่งคำทาย (จำนวนครั้งตาม maxEntries / ปิดรับ / หักแต้ม) + เฉลยจ่ายรางวัลผู้ชนะทุกคน + idempotent + สิทธิ์
// ============================================================
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInAnonymously } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, collection, getDocs, Timestamp } from 'firebase/firestore';

const PROJECT = 'demo-bocean';
const TID = 'demo';

let env, auth, uid, submit, settle;

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
  submit = (data) => httpsCallable(functions, 'submitPrediction')(data).then((r) => r.data);
  settle = (data) => httpsCallable(functions, 'settlePrediction')(data).then((r) => r.data);
});
after(async () => { await env.cleanup(); });

async function seed(pred, user, entries) {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `tenants/${TID}`), { status: 'active' });
    await setDoc(doc(db, `tenants/${TID}/users/${uid}`), user || { points: 0 });
    await setDoc(doc(db, `tenants/${TID}/predictions/p1`), pred);
    if (entries) for (let i = 0; i < entries.length; i++) await setDoc(doc(db, `tenants/${TID}/predictions/p1/entries/e${i}`), entries[i]);
  });
}
async function read(path) { let o; await env.withSecurityRulesDisabled(async (ctx) => { o = await getDoc(doc(ctx.firestore(), path)); }); return o.exists ? o.data() : null; }
async function countCol(path) { let n=0; await env.withSecurityRulesDisabled(async (ctx) => { const s = await getDocs(collection(ctx.firestore(), path)); n = s.size; }); return n; }
async function expectFail(fn, data, code) { await assert.rejects(() => fn(data), (e) => { assert.match(String(e.code||''), new RegExp(code+'$')); return true; }); }

const future = () => Timestamp.fromMillis(Date.now() + 3600e3);
const past = () => Timestamp.fromMillis(Date.now() - 3600e3);
const openChoice = (extra) => Object.assign({ name:'บอล', mode:'choice', options:['A','B'], status:'open', active:true, closeAt: future(), costPoints:0, maxEntries:1, rewardType:'points', rewardPoints:100 }, extra||{});

// ── submit ─────────────────────────────────────────────────
test('ส่งคำทาย → entry + userCounts + entriesCount', async () => {
  await setAdminClaim(false);
  await seed(openChoice(), { points: 0 });
  const res = await submit({ tid: TID, eventId: 'p1', answer: 'A' });
  assert.equal(res.answer, 'A'); assert.equal(res.played, 1);
  assert.equal(await countCol(`tenants/${TID}/predictions/p1/entries`), 1);
  assert.equal((await read(`tenants/${TID}/predictions/p1/userCounts/${uid}`)).count, 1);
  assert.equal((await read(`tenants/${TID}/predictions/p1`)).entriesCount, 1);
});
test('choice ตัวเลือกผิด → invalid-argument', async () => {
  await seed(openChoice(), { points: 0 });
  await expectFail(submit, { tid: TID, eventId: 'p1', answer: 'Z' }, 'invalid-argument');
});
test('maxEntries 1 → ทายครั้งที่ 2 = failed-precondition', async () => {
  await seed(openChoice({ maxEntries: 1 }), { points: 0 });
  await submit({ tid: TID, eventId: 'p1', answer: 'A' });
  await expectFail(submit, { tid: TID, eventId: 'p1', answer: 'B' }, 'failed-precondition');
});
test('maxEntries 3 → เล่นได้ 3, ครั้งที่ 4 ล้ม', async () => {
  await seed(openChoice({ maxEntries: 3 }), { points: 0 });
  await submit({ tid: TID, eventId: 'p1', answer: 'A' });
  await submit({ tid: TID, eventId: 'p1', answer: 'B' });
  await submit({ tid: TID, eventId: 'p1', answer: 'A' });
  assert.equal((await read(`tenants/${TID}/predictions/p1/userCounts/${uid}`)).count, 3);
  assert.equal(await countCol(`tenants/${TID}/predictions/p1/entries`), 3);
  await expectFail(submit, { tid: TID, eventId: 'p1', answer: 'A' }, 'failed-precondition');
});
test('maxEntries 0 (ไม่จำกัด) + ค่าเข้าร่วม → เล่นจนแต้มหมด', async () => {
  await seed(openChoice({ maxEntries: 0, costPoints: 20 }), { points: 50 });
  await submit({ tid: TID, eventId: 'p1', answer: 'A' });   // -20 → 30
  await submit({ tid: TID, eventId: 'p1', answer: 'A' });   // -20 → 10
  assert.equal((await read(`tenants/${TID}/users/${uid}`)).points, 10);
  await expectFail(submit, { tid: TID, eventId: 'p1', answer: 'A' }, 'failed-precondition');   // 10 < 20
});
test('ปิดรับแล้ว (เลยเวลา) → failed-precondition', async () => {
  await seed(openChoice({ closeAt: past() }), { points: 0 });
  await expectFail(submit, { tid: TID, eventId: 'p1', answer: 'A' }, 'failed-precondition');
});

// ── settle ─────────────────────────────────────────────────
test('เฉลย → ผู้ชนะได้แต้ม, entry won+rewarded, ผู้แพ้ไม่ได้', async () => {
  await setAdminClaim(true);
  await seed(openChoice({ rewardPoints: 100 }), { points: 0 }, [
    { uid: uid, answer: 'A', won:false, rewarded:false },
    { uid: 'loser', answer: 'B', won:false, rewarded:false },
  ]);
  const res = await settle({ tid: TID, eventId: 'p1', correctAnswer: 'A' });
  assert.equal(res.winners, 1); assert.equal(res.granted, 1);
  assert.equal((await read(`tenants/${TID}/users/${uid}`)).points, 100);
  assert.equal((await read(`tenants/${TID}/predictions/p1`)).status, 'settled');
});
test('multi-entry: 2 คำทายถูก → ได้รางวัล 2 เท่า', async () => {
  await setAdminClaim(true);
  await seed(openChoice({ maxEntries: 0, rewardPoints: 100 }), { points: 0 }, [
    { uid: uid, answer: 'A', won:false, rewarded:false },
    { uid: uid, answer: 'A', won:false, rewarded:false },
    { uid: uid, answer: 'B', won:false, rewarded:false },
  ]);
  const res = await settle({ tid: TID, eventId: 'p1', correctAnswer: 'A' });
  assert.equal(res.winners, 2); assert.equal(res.granted, 2);
  assert.equal((await read(`tenants/${TID}/users/${uid}`)).points, 200);   // 2 × 100
});
test('เฉลยซ้ำ → ไม่จ่ายซ้ำ (idempotent)', async () => {
  await setAdminClaim(true);
  await seed(openChoice({ rewardPoints: 100 }), { points: 0 }, [{ uid: uid, answer: 'A', won:false, rewarded:false }]);
  await settle({ tid: TID, eventId: 'p1', correctAnswer: 'A' });
  const res2 = await settle({ tid: TID, eventId: 'p1', correctAnswer: 'A' });
  assert.equal(res2.granted, 0);
  assert.equal((await read(`tenants/${TID}/users/${uid}`)).points, 100);
});
test('เฉลยรางวัลคูปอง → ผู้ชนะได้คูปอง', async () => {
  await setAdminClaim(true);
  await seed(openChoice({ rewardType:'coupon', coupon:{ label:'ลด 50', discountType:'fixed', discountValue:50, code:'WIN50' } }),
    { points: 0 }, [{ uid: uid, answer: 'A', won:false, rewarded:false }]);
  await settle({ tid: TID, eventId: 'p1', correctAnswer: 'A' });
  assert.equal(await countCol(`tenants/${TID}/users/${uid}/coupons`), 1);
});
test('ไม่ใช่แอดมิน settle → permission-denied', async () => {
  await setAdminClaim(false);
  await seed(openChoice(), { points: 0 }, [{ uid: uid, answer:'A', won:false, rewarded:false }]);
  await expectFail(settle, { tid: TID, eventId: 'p1', correctAnswer: 'A' }, 'permission-denied');
});
