// ============================================================
//  submitPrediction + settlePrediction — e2e ผ่าน emulator (ทายผล)
//  รัน (serial):
//    firebase emulators:exec --only functions,firestore,auth --project demo-bocean \
//      "node --test --test-concurrency=1 tests/spin.test.js tests/place.test.js tests/cancel.test.js tests/mission.test.js tests/prediction.test.js"
//  ทดสอบ: ส่งคำทาย (ครั้งเดียว/ปิดรับ/หักแต้ม) + เฉลยจ่ายรางวัลผู้ชนะอัตโนมัติ + idempotent + สิทธิ์
// ============================================================
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInAnonymously } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';

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
    if (entries) for (const e of entries) await setDoc(doc(db, `tenants/${TID}/predictions/p1/entries/${e.uid}`), e);
  });
}
async function read(path) { let o; await env.withSecurityRulesDisabled(async (ctx) => { o = await getDoc(doc(ctx.firestore(), path)); }); return o.exists ? o.data() : null; }
async function expectFail(fn, data, code) { await assert.rejects(() => fn(data), (e) => { assert.match(String(e.code||''), new RegExp(code+'$')); return true; }); }

const future = () => Timestamp.fromMillis(Date.now() + 3600e3);
const past = () => Timestamp.fromMillis(Date.now() - 3600e3);
const openChoice = (extra) => Object.assign({ name:'บอล', mode:'choice', options:['A','B'], status:'open', active:true, closeAt: future(), costPoints:0, rewardType:'points', rewardPoints:100 }, extra||{});

// ── submit ─────────────────────────────────────────────────
test('ส่งคำทาย → entry ถูกสร้าง + entriesCount++', async () => {
  await setAdminClaim(false);
  await seed(openChoice(), { points: 0 });
  const res = await submit({ tid: TID, eventId: 'p1', answer: 'A' });
  assert.equal(res.answer, 'A');
  const e = await read(`tenants/${TID}/predictions/p1/entries/${uid}`);
  assert.equal(e.answer, 'A'); assert.equal(e.won, false);
  assert.equal((await read(`tenants/${TID}/predictions/p1`)).entriesCount, 1);
});
test('choice ตัวเลือกผิด → invalid-argument', async () => {
  await seed(openChoice(), { points: 0 });
  await expectFail(submit, { tid: TID, eventId: 'p1', answer: 'Z' }, 'invalid-argument');
});
test('ทายซ้ำ → failed-precondition', async () => {
  await seed(openChoice(), { points: 0 });
  await submit({ tid: TID, eventId: 'p1', answer: 'A' });
  await expectFail(submit, { tid: TID, eventId: 'p1', answer: 'B' }, 'failed-precondition');
});
test('ปิดรับแล้ว (เลยเวลา) → failed-precondition', async () => {
  await seed(openChoice({ closeAt: past() }), { points: 0 });
  await expectFail(submit, { tid: TID, eventId: 'p1', answer: 'A' }, 'failed-precondition');
});
test('ค่าเข้าร่วม: หักแต้ม · แต้มไม่พอ → failed-precondition', async () => {
  await seed(openChoice({ costPoints: 20 }), { points: 50 });
  await submit({ tid: TID, eventId: 'p1', answer: 'A' });
  assert.equal((await read(`tenants/${TID}/users/${uid}`)).points, 30);   // 50 - 20
  // อีกคน (จำลอง) แต้มไม่พอ — ใช้ user เดิมหลังหักเหลือ 30 แล้วทายอีกอันคอสต์สูง
  await seed(openChoice({ costPoints: 100 }), { points: 50 });
  await expectFail(submit, { tid: TID, eventId: 'p1', answer: 'A' }, 'failed-precondition');
});

// ── settle ─────────────────────────────────────────────────
test('เฉลย → ผู้ชนะได้แต้ม, entry won+rewarded, ผู้แพ้ไม่ได้', async () => {
  await setAdminClaim(true);
  await seed(openChoice({ rewardPoints: 100 }), { points: 0 }, [
    { uid: uid, answer: 'A', won:false, rewarded:false },
    { uid: 'loser', answer: 'B', won:false, rewarded:false },
  ]);
  // ต้องมี user doc ของ loser ไว้รับผล (ไม่ได้รางวัลอยู่แล้ว) — ไม่ต้องสร้างก็ได้เพราะไม่ชนะ
  const res = await settle({ tid: TID, eventId: 'p1', correctAnswer: 'A' });
  assert.equal(res.winners, 1);
  assert.equal(res.granted, 1);
  assert.equal((await read(`tenants/${TID}/users/${uid}`)).points, 100);
  const e = await read(`tenants/${TID}/predictions/p1/entries/${uid}`);
  assert.equal(e.won, true); assert.equal(e.rewarded, true);
  assert.equal((await read(`tenants/${TID}/predictions/p1`)).status, 'settled');
});
test('เฉลยซ้ำ → ไม่จ่ายซ้ำ (idempotent)', async () => {
  await setAdminClaim(true);
  await seed(openChoice({ rewardPoints: 100 }), { points: 0 }, [{ uid: uid, answer: 'A', won:false, rewarded:false }]);
  await settle({ tid: TID, eventId: 'p1', correctAnswer: 'A' });
  const res2 = await settle({ tid: TID, eventId: 'p1', correctAnswer: 'A' });
  assert.equal(res2.granted, 0);
  assert.equal((await read(`tenants/${TID}/users/${uid}`)).points, 100);   // ไม่ +100 ซ้ำ
});
test('เฉลยรางวัลคูปอง → ผู้ชนะได้คูปอง', async () => {
  await setAdminClaim(true);
  await seed(openChoice({ rewardType:'coupon', coupon:{ label:'ลด 50', discountType:'fixed', discountValue:50, code:'WIN50' } }),
    { points: 0 }, [{ uid: uid, answer: 'A', won:false, rewarded:false }]);
  await settle({ tid: TID, eventId: 'p1', correctAnswer: 'A' });
  let cs=[]; await env.withSecurityRulesDisabled(async (ctx)=>{ const { collection, getDocs } = await import('firebase/firestore'); const s = await getDocs(collection(ctx.firestore(), `tenants/${TID}/users/${uid}/coupons`)); cs = s.docs.map(d=>d.data()); });
  assert.equal(cs.length, 1);
  assert.equal(cs[0].discountValue, 50);
});
test('ไม่ใช่แอดมิน settle → permission-denied', async () => {
  await setAdminClaim(false);
  await seed(openChoice(), { points: 0 }, [{ uid: uid, answer:'A', won:false, rewarded:false }]);
  await expectFail(settle, { tid: TID, eventId: 'p1', correctAnswer: 'A' }, 'permission-denied');
});
