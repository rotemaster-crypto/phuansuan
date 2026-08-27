// ============================================================
//  claimMission — e2e ผ่าน emulator (ภารกิจ Phase 4)
//  รัน (serial กับไฟล์อื่น):
//    firebase emulators:exec --only functions,firestore,auth --project demo-bocean \
//      "node --test --test-concurrency=1 tests/spin.test.js tests/place.test.js tests/cancel.test.js tests/mission.test.js"
//  ทดสอบ: server ตรวจ progress (points/posts/purchases), ให้แต้ม/คูปอง, กันรับซ้ำ, guard
// ============================================================
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInAnonymously } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';

const PROJECT = 'demo-bocean';
const TID = 'demo';

let env, claim, uid;

before(async () => {
  env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { host: '127.0.0.1', port: 8080 } });
  const app = initializeApp({ projectId: PROJECT, apiKey: 'fake-api-key' });
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const functions = getFunctions(app, 'asia-southeast1');
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  uid = (await signInAnonymously(auth)).user.uid;
  claim = (data) => httpsCallable(functions, 'claimMission')(data).then((r) => r.data);
});
after(async () => { await env.cleanup(); });

async function seed(user, mission, orders) {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `tenants/${TID}`), { status: 'active' });
    await setDoc(doc(db, `tenants/${TID}/users/${uid}`), user);
    await setDoc(doc(db, `tenants/${TID}/missions/m1`), mission);
    if (orders) for (let i = 0; i < orders.length; i++) await setDoc(doc(db, `tenants/${TID}/orders/o${i}`), orders[i]);
  });
}
async function read(path) { let out; await env.withSecurityRulesDisabled(async (ctx) => { out = await getDoc(doc(ctx.firestore(), path)); }); return out.data(); }
async function coupons() { let ds=[]; await env.withSecurityRulesDisabled(async (ctx) => { const s = await getDocs(collection(ctx.firestore(), `tenants/${TID}/users/${uid}/coupons`)); ds = s.docs.map(d=>d.data()); }); return ds; }
async function expectFail(data, code) { await assert.rejects(() => claim(data), (e) => { assert.match(String(e.code||''), new RegExp(code+'$')); return true; }); }

// ── points mission → ให้แต้ม + บันทึกการรับ ──────────────────
test('points: ถึงเป้า → รับแต้ม + claim ถูกบันทึก', async () => {
  await seed({ points: 1000, postCount: 0 }, { name:'ถึง 500 แต้ม', type:'points', goal:500, active:true, rewardType:'points', rewardPoints:100 });
  const res = await claim({ tid: TID, missionId: 'm1' });
  assert.equal(res.reward.type, 'points');
  assert.equal(res.reward.points, 100);
  const u = await read(`tenants/${TID}/users/${uid}`);
  assert.equal(u.points, 1100);            // 1000 + 100
  const c = await read(`tenants/${TID}/users/${uid}/missionClaims/m1`);
  assert.equal(c.rewardType, 'points');
  const m = await read(`tenants/${TID}/missions/m1`);
  assert.equal(m.claimCount, 1);           // analytics counter เพิ่มขึ้น 1
});

// ── posts mission (progress จาก postCount) ──────────────────
test('posts: postCount ถึงเป้า → รับได้', async () => {
  await seed({ points: 0, postCount: 5 }, { name:'โพสต์ 5', type:'posts', goal:5, active:true, rewardType:'points', rewardPoints:50 });
  const res = await claim({ tid: TID, missionId: 'm1' });
  assert.equal(res.reward.points, 50);
  assert.equal((await read(`tenants/${TID}/users/${uid}`)).points, 50);
});

// ── purchases mission (นับออเดอร์ที่จ่ายแล้ว) ────────────────
test('purchases: 2 ออเดอร์ที่จ่ายแล้ว → ถึงเป้า 2', async () => {
  await seed({ points: 0 }, { name:'ซื้อ 2', type:'purchases', goal:2, active:true, rewardType:'points', rewardPoints:80 },
    [{ userId: uid, status:'confirmed' }, { userId: uid, status:'paid_review' }, { userId: uid, status:'pending_payment' }]);
  const res = await claim({ tid: TID, missionId: 'm1' });   // นับเฉพาะ confirmed+paid_review = 2 (ไม่นับ pending)
  assert.equal(res.progress, 2);
  assert.equal(res.reward.points, 80);
});

// ── ยังไม่ถึงเป้า → failed-precondition ─────────────────────
test('ยังไม่ถึงเป้า → failed-precondition, ไม่ได้แต้ม', async () => {
  await seed({ points: 100 }, { name:'ถึง 500', type:'points', goal:500, active:true, rewardType:'points', rewardPoints:100 });
  await expectFail({ tid: TID, missionId: 'm1' }, 'failed-precondition');
  assert.equal((await read(`tenants/${TID}/users/${uid}`)).points, 100);
});

// ── กันรับซ้ำ ───────────────────────────────────────────────
test('รับซ้ำ → failed-precondition', async () => {
  await seed({ points: 1000 }, { name:'ถึง 500', type:'points', goal:500, active:true, rewardType:'points', rewardPoints:100 });
  await claim({ tid: TID, missionId: 'm1' });
  await expectFail({ tid: TID, missionId: 'm1' }, 'failed-precondition');
  assert.equal((await read(`tenants/${TID}/users/${uid}`)).points, 1100);   // ไม่ได้ +100 ซ้ำ
  assert.equal((await read(`tenants/${TID}/missions/m1`)).claimCount, 1);    // counter ไม่นับซ้ำ (idempotent)
});

// ── รางวัลคูปอง ─────────────────────────────────────────────
test('rewardType coupon → ออกคูปองส่วนลด', async () => {
  await seed({ points: 1000 }, { name:'รับคูปอง', type:'points', goal:500, active:true, rewardType:'coupon',
    coupon:{ label:'ลด 50', discountType:'fixed', discountValue:50, discountText:'ลด ฿50', code:'MISSION50' } });
  const res = await claim({ tid: TID, missionId: 'm1' });
  assert.equal(res.reward.type, 'coupon');
  const cs = await coupons();
  assert.equal(cs.length, 1);
  assert.equal(cs[0].discountType, 'fixed');
  assert.equal(cs[0].discountValue, 50);
  assert.equal(cs[0].used, false);
});

// ── ภารกิจปิด → failed-precondition ─────────────────────────
test('ภารกิจปิด → failed-precondition', async () => {
  await seed({ points: 1000 }, { name:'ปิด', type:'points', goal:1, active:false, rewardType:'points', rewardPoints:10 });
  await expectFail({ tid: TID, missionId: 'm1' }, 'failed-precondition');
});
