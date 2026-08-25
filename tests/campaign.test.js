// ============================================================
//  Campaign builder (แคมเปญแต้ม) — e2e ผ่าน emulator
//  รัน (serial กับไฟล์อื่น):
//    firebase emulators:exec --only functions,firestore,auth --project demo-bocean \
//      "node --test --test-concurrency=1 tests/campaign.test.js"
//  ทดสอบ trigger จริง: order→confirmed ให้แต้มจากยอดซื้อ, multiplier, ยอดขั้นต่ำ,
//  ช่วงเวลา (startAt/endAt), กันซ้ำ (pointsAwarded), โบนัสโพสต์ (onPostCreated)
// ============================================================
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInAnonymously } from 'firebase/auth';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, Timestamp } from 'firebase/firestore';

const PROJECT = 'demo-bocean';
const TID = 'demo';

let env, uid;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

before(async () => {
  env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { host: '127.0.0.1', port: 8080 } });
  const app = initializeApp({ projectId: PROJECT, apiKey: 'fake-api-key' });
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  uid = (await signInAnonymously(auth)).user.uid;
});
after(async () => { await env.cleanup(); });

async function write(fn) { await env.withSecurityRulesDisabled(async (ctx) => { await fn(ctx.firestore()); }); }
async function read(path) { let out; await env.withSecurityRulesDisabled(async (ctx) => { out = await getDoc(doc(ctx.firestore(), path)); }); return out.exists() ? out.data() : null; }

async function seedBase(user) {
  await env.clearFirestore();
  await write(async (db) => {
    await setDoc(doc(db, `tenants/${TID}`), { status: 'active' });
    await setDoc(doc(db, `tenants/${TID}/users/${uid}`), user);
  });
}
// รอ trigger ทำงาน (poll จนกว่า pred เป็นจริง หรือ timeout)
async function waitUntil(path, pred, ms = 12000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const d = await read(path); if (d && pred(d)) return d; await sleep(250); }
  return await read(path);
}
// สร้างออเดอร์ pending แล้วอัปเป็น confirmed (จุดที่ trigger onOrderConfirmed ยิง)
async function placeAndConfirm(subtotal) {
  await write(async (db) => { await setDoc(doc(db, `tenants/${TID}/orders/o1`), { userId: uid, subtotal, status: 'pending_payment' }); });
  await write(async (db) => { await updateDoc(doc(db, `tenants/${TID}/orders/o1`), { status: 'confirmed' }); });
  return waitUntil(`tenants/${TID}/orders/o1`, (o) => o.pointsAwarded === true);
}

// ── ซื้อครบ 100 ได้ 1 แต้ม → subtotal 500 = 5 แต้ม ──────────────
test('purchase: ยอด 500, กติกา 1 แต้ม/100฿ → +5 แต้ม + pointsAwarded', async () => {
  await seedBase({ points: 0 });
  await write(async (db) => { await setDoc(doc(db, `tenants/${TID}/earnCampaigns/c1`), { trigger: 'purchase', active: true, ratePoints: 1, ratePerBaht: 100, minSpend: 0, multiplier: 1 }); });
  const o = await placeAndConfirm(500);
  assert.equal(o.pointsAwarded, true);
  assert.equal(o.pointsEarned, 5);
  assert.equal((await read(`tenants/${TID}/users/${uid}`)).points, 5);
});

// ── multiplier x2 → 10 แต้ม ─────────────────────────────────
test('purchase: multiplier x2 → +10 แต้ม', async () => {
  await seedBase({ points: 0 });
  await write(async (db) => { await setDoc(doc(db, `tenants/${TID}/earnCampaigns/c1`), { trigger: 'purchase', active: true, ratePoints: 1, ratePerBaht: 100, minSpend: 0, multiplier: 2 }); });
  const o = await placeAndConfirm(500);
  assert.equal(o.pointsEarned, 10);
  assert.equal((await read(`tenants/${TID}/users/${uid}`)).points, 10);
});

// ── ยอดต่ำกว่าขั้นต่ำ → ไม่ได้แต้ม (แต่ mark pointsAwarded) ────
test('purchase: subtotal < minSpend → 0 แต้ม', async () => {
  await seedBase({ points: 0 });
  await write(async (db) => { await setDoc(doc(db, `tenants/${TID}/earnCampaigns/c1`), { trigger: 'purchase', active: true, ratePoints: 1, ratePerBaht: 100, minSpend: 1000, multiplier: 1 }); });
  const o = await placeAndConfirm(500);
  assert.equal(o.pointsEarned, 0);
  assert.equal((await read(`tenants/${TID}/users/${uid}`)).points, 0);
});

// ── แคมเปญหมดเวลา (endAt อดีต) → ไม่ได้แต้ม ──────────────────
test('purchase: endAt เป็นอดีต → นอกช่วง ไม่ได้แต้ม', async () => {
  await seedBase({ points: 0 });
  await write(async (db) => { await setDoc(doc(db, `tenants/${TID}/earnCampaigns/c1`), { trigger: 'purchase', active: true, ratePoints: 1, ratePerBaht: 100, minSpend: 0, multiplier: 1, endAt: Timestamp.fromMillis(Date.now() - 60000) }); });
  const o = await placeAndConfirm(500);
  assert.equal(o.pointsEarned, 0);
  assert.equal((await read(`tenants/${TID}/users/${uid}`)).points, 0);
});

// ── แคมเปญปิด (active=false) → ไม่ได้แต้ม ─────────────────────
test('purchase: active=false → ไม่ได้แต้ม', async () => {
  await seedBase({ points: 0 });
  await write(async (db) => { await setDoc(doc(db, `tenants/${TID}/earnCampaigns/c1`), { trigger: 'purchase', active: false, ratePoints: 1, ratePerBaht: 100, minSpend: 0, multiplier: 1 }); });
  const o = await placeAndConfirm(500);
  assert.equal(o.pointsEarned, 0);
});

// ── ไม่มีแคมเปญเลย → order confirmed ไม่พัง (0 แต้ม + mark) ────
test('purchase: ไม่มีแคมเปญ → 0 แต้ม แต่ mark pointsAwarded', async () => {
  await seedBase({ points: 0 });
  const o = await placeAndConfirm(500);
  assert.equal(o.pointsAwarded, true);
  assert.equal(o.pointsEarned, 0);
});

// ── โบนัสโพสต์ (trigger=post) → perPost(10) + โบนัส(5) = 15 ───
test('post: โบนัสแคมเปญ +5 บวกจากแต้มโพสต์ปกติ → +15', async () => {
  await seedBase({ points: 0, postCount: 0 });
  await write(async (db) => { await setDoc(doc(db, `tenants/${TID}/earnCampaigns/c1`), { trigger: 'post', active: true, bonusPoints: 5, multiplier: 1 }); });
  await write(async (db) => { await setDoc(doc(db, `tenants/${TID}/posts/p1`), { authorId: uid, text: 'hello' }); });
  const u = await waitUntil(`tenants/${TID}/users/${uid}`, (u) => (u.postCount || 0) >= 1);
  assert.equal(u.postCount, 1);
  assert.equal(u.points, 15);   // 10 (perPost default) + 5 (โบนัสแคมเปญ)
});

// ── โบนัสโพสต์ x3 → perPost(10) + 5*3 = 25 ───────────────────
test('post: โบนัส x3 → +25', async () => {
  await seedBase({ points: 0, postCount: 0 });
  await write(async (db) => { await setDoc(doc(db, `tenants/${TID}/earnCampaigns/c1`), { trigger: 'post', active: true, bonusPoints: 5, multiplier: 3 }); });
  await write(async (db) => { await setDoc(doc(db, `tenants/${TID}/posts/p1`), { authorId: uid, text: 'hi' }); });
  const u = await waitUntil(`tenants/${TID}/users/${uid}`, (u) => (u.postCount || 0) >= 1);
  assert.equal(u.points, 25);
});
