// ============================================================
//  claimStreak — เช็คอินต่อเนื่องรายวัน (streak engine) e2e ผ่าน emulator
//  รัน (serial):
//    firebase emulators:exec --only functions,firestore,auth --project demo-bocean \
//      "node --test --test-concurrency=1 tests/streak.test.js"
//  ล็อก: server-authoritative · ต่อเนื่อง+1 · ขาด reset=1 · idempotent/วัน · milestone ให้แต้ม
//        · ปิด/ไม่มี config = ปฏิเสธ (fail-safe) · seed streakLastDay สัมพัทธ์กับวันนี้ (BKK)
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
let env, uid, claimStreak;

// day key แบบเดียวกับ bkkDayKey ฝั่ง server (UTC+7, YYYY-MM-DD)
const dayKey = (offsetDays) => new Date(Date.now() + 7 * 3600 * 1000 - (offsetDays || 0) * 86400000).toISOString().slice(0, 10);
const TODAY = dayKey(0), YESTERDAY = dayKey(1), THREE_AGO = dayKey(3);

before(async () => {
  env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { host: '127.0.0.1', port: 8080 } });
  const app = initializeApp({ projectId: PROJECT, apiKey: 'fake-api-key' });
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const functions = getFunctions(app, 'asia-southeast1');
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  uid = (await signInAnonymously(auth)).user.uid;
  claimStreak = (d) => httpsCallable(functions, 'claimStreak')(d).then((r) => r.data);
});
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

async function write(fn) { await env.withSecurityRulesDisabled(async (ctx) => { await fn(ctx.firestore()); }); }
async function read(path) { let out; await env.withSecurityRulesDisabled(async (ctx) => { out = await getDoc(doc(ctx.firestore(), path)); }); return out.exists() ? out.data() : null; }
// seed ร้าน + config streak + user (streak state ตามต้องการ)
async function seed(cfg, userExtra) {
  await write(async (db) => {
    await setDoc(doc(db, `tenants/${TID}`), { status: 'active' });
    if (cfg) await setDoc(doc(db, `tenants/${TID}/settings/streak`), cfg);
    await setDoc(doc(db, `tenants/${TID}/users/${uid}`), Object.assign({ points: 0 }, userExtra || {}));
  });
}
const ENABLED = { enabled: true, milestones: [{ days: 3, rewardPoints: 50 }] };
function rejectsCode(fn, suffix) {
  return assert.rejects(fn, (e) => { assert.match(String(e.code || ''), new RegExp(suffix + '$')); return true; });
}

test('เช็คอินครั้งแรก → streak=1, ไม่มีรางวัล (ยังไม่ถึง milestone)', async () => {
  await seed(ENABLED, {});
  const r = await claimStreak({ tid: TID });
  assert.equal(r.streak, 1);
  assert.equal(r.granted, 0);
  const u = await read(`tenants/${TID}/users/${uid}`);
  assert.equal(u.streakCount, 1);
  assert.equal(u.streakLastDay, TODAY);
});

test('ต่อเนื่อง (เมื่อวานเช็คอิน, streak 2) → streak=3 + แตะ milestone +50 แต้ม', async () => {
  await seed(ENABLED, { streakLastDay: YESTERDAY, streakCount: 2, points: 10 });
  const r = await claimStreak({ tid: TID });
  assert.equal(r.streak, 3);
  assert.equal(r.granted, 50);
  const u = await read(`tenants/${TID}/users/${uid}`);
  assert.equal(u.streakCount, 3);
  assert.equal(u.points, 60, '10 + 50 milestone');
  const c = await read(`tenants/${TID}/settings/streak`);
  assert.equal(c.claimCount, 1, 'analytics counter นับเช็คอินจริง');
});

test('เช็คอินซ้ำวันเดียวกัน → idempotent (alreadyToday, ไม่เพิ่ม streak/แต้ม)', async () => {
  await seed(ENABLED, { streakLastDay: TODAY, streakCount: 5, points: 100 });
  const r = await claimStreak({ tid: TID });
  assert.equal(r.alreadyToday, true);
  assert.equal(r.streak, 5);
  assert.equal(r.granted, 0);
  const u = await read(`tenants/${TID}/users/${uid}`);
  assert.equal(u.streakCount, 5, 'streak ไม่ขยับ');
  assert.equal(u.points, 100, 'แต้มไม่ขยับ');
});

test('ขาดวัน (เช็คอินล่าสุด 3 วันก่อน) → reset streak=1', async () => {
  await seed(ENABLED, { streakLastDay: THREE_AGO, streakCount: 9, points: 0 });
  const r = await claimStreak({ tid: TID });
  assert.equal(r.streak, 1, 'ขาดช่วง → เริ่มนับใหม่');
  assert.equal(r.granted, 0);
});

test('ร้านปิดระบบ streak (enabled:false) → failed-precondition', async () => {
  await seed({ enabled: false, milestones: [] }, {});
  await rejectsCode(() => claimStreak({ tid: TID }), 'failed-precondition');
});

test('ไม่มี config streak เลย → failed-precondition (fail-safe)', async () => {
  await seed(null, {});
  await rejectsCode(() => claimStreak({ tid: TID }), 'failed-precondition');
});
