// ============================================================
//  spinLuckyDraw — e2e ผ่าน emulator (functions + firestore + auth)
//  รันด้วย:
//    firebase emulators:exec --only functions,firestore,auth --project demo-bocean \
//      "node --test tests/spin.test.js"
//  ทดสอบตรรกะจริงของ Cloud Function: หักแต้ม + สุ่ม + ตัดสต็อก + เขียนคูปอง + guard
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

let env, spin, uid;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { host: '127.0.0.1', port: 8080 },
  });
  const app = initializeApp({ projectId: PROJECT, apiKey: 'fake-api-key' });
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const functions = getFunctions(app, 'asia-southeast1');
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  const cred = await signInAnonymously(auth);
  uid = cred.user.uid;                      // uid ของ user ที่ login (= เจ้าของ user doc)
  spin = (data) => httpsCallable(functions, 'spinLuckyDraw')(data).then((r) => r.data);
});

after(async () => { await env.cleanup(); });

// seed แบบข้าม rules ก่อนแต่ละเทสต์ (tenant + user + draw)
async function seed({ points = 100, draw }) {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `tenants/${TID}`), { status: 'active', name: 'Demo' });
    await setDoc(doc(db, `tenants/${TID}/users/${uid}`), { points, tier: 'bronze', banned: false });
    await setDoc(doc(db, `tenants/${TID}/luckyDraws/d1`), draw);
  });
}

// อ่าน state หลังหมุน (ข้าม rules)
async function read(path) {
  let out;
  await env.withSecurityRulesDisabled(async (ctx) => {
    out = await getDoc(doc(ctx.firestore(), path));
  });
  return out;
}
async function listCoupons() {
  // อ่านตรงผ่าน user doc subcollection ไม่สะดวกด้วย modular getDocs+rules-disabled;
  // ใช้ REST ผ่าน ctx แทน: เดินผ่าน collection
  const { collection, getDocs } = await import('firebase/firestore');
  let docs = [];
  await env.withSecurityRulesDisabled(async (ctx) => {
    const snap = await getDocs(collection(ctx.firestore(), `tenants/${TID}/users/${uid}/coupons`));
    docs = snap.docs.map((d) => d.data());
  });
  return docs;
}

// helper: เรียกแล้วคาดว่าจะ throw code อะไร
async function expectFail(data, codeSuffix) {
  await assert.rejects(
    () => spin(data),
    (e) => {
      assert.match(String(e.code || ''), new RegExp(codeSuffix + '$'), `code ควรลงท้าย ${codeSuffix} แต่ได้ ${e.code}`);
      return true;
    }
  );
}

// ── 1. ชนะแน่นอน (คูปอง weight เดียว, stock ไม่จำกัด) ─────────
test('ชนะ → ได้คูปอง + หักแต้ม + spins++', async () => {
  await seed({
    points: 100,
    draw: { name: 'กล่องทอง', active: true, costPoints: 20,
      prizes: [{ type: 'coupon', label: 'ส่วนลด 50', weight: 1, stock: null, discountText: 'ลด 50 บาท' }] },
  });
  const res = await spin({ tid: TID, drawId: 'd1' });
  assert.equal(res.win, true);
  assert.equal(res.costPoints, 20);
  assert.equal(res.pointsLeft, 80);
  assert.ok(res.coupon && res.coupon.code, 'ต้องมี coupon.code กลับมา');

  const u = await read(`tenants/${TID}/users/${uid}`);
  assert.equal(u.data().points, 80, 'แต้มต้องถูกหัก 20');
  const d = await read(`tenants/${TID}/luckyDraws/d1`);
  assert.equal(d.data().spins, 1, 'spins ต้อง +1');
  const coupons = await listCoupons();
  assert.equal(coupons.length, 1, 'ต้องมีคูปอง 1 ใบ');
  assert.equal(coupons[0].used, false);
  assert.equal(coupons[0].drawId, 'd1');
});

// ── 2. แต้มไม่พอ → ปฏิเสธ + ไม่หักแต้ม ไม่ออกคูปอง ───────────
test('แต้มไม่พอ → failed-precondition, state ไม่เปลี่ยน', async () => {
  await seed({
    points: 5,
    draw: { name: 'กล่อง', active: true, costPoints: 20,
      prizes: [{ type: 'coupon', label: 'x', weight: 1, stock: null }] },
  });
  await expectFail({ tid: TID, drawId: 'd1' }, 'failed-precondition');
  const u = await read(`tenants/${TID}/users/${uid}`);
  assert.equal(u.data().points, 5, 'แต้มต้องไม่ถูกแตะ');
  assert.equal((await listCoupons()).length, 0, 'ต้องไม่มีคูปอง');
  const d = await read(`tenants/${TID}/luckyDraws/d1`);
  assert.ok(!d.data().spins, 'spins ต้องไม่ขยับ');
});

// ── 3. กิจกรรมปิด (active:false) → ปฏิเสธ ────────────────────
test('กิจกรรมปิด → failed-precondition', async () => {
  await seed({
    points: 100,
    draw: { name: 'ปิดอยู่', active: false, costPoints: 20,
      prizes: [{ type: 'coupon', label: 'x', weight: 1, stock: null }] },
  });
  await expectFail({ tid: TID, drawId: 'd1' }, 'failed-precondition');
  assert.equal((await read(`tenants/${TID}/users/${uid}`)).data().points, 100);
});

// ── 4. รางวัลหมด (ทุกชิ้น weight 0) → ปฏิเสธ ก่อนหักแต้ม ──────
test('ไม่มีรางวัลใน pool → failed-precondition, ไม่หักแต้ม', async () => {
  await seed({
    points: 100,
    draw: { name: 'ว่าง', active: true, costPoints: 20,
      prizes: [{ type: 'coupon', label: 'x', weight: 0, stock: null }] },
  });
  await expectFail({ tid: TID, drawId: 'd1' }, 'failed-precondition');
  assert.equal((await read(`tenants/${TID}/users/${uid}`)).data().points, 100, 'ต้องไม่หักแต้มเมื่อ pool ว่าง');
});

// ── 5. "ไม่ถูกรางวัล" (type nothing) → win:false แต่หักแต้ม ───
test('nothing → win:false, ไม่มีคูปอง, แต่หักแต้ม + spins++', async () => {
  await seed({
    points: 100,
    draw: { name: 'เกือบ', active: true, costPoints: 30,
      prizes: [{ type: 'nothing', label: 'พลาดไปนิด', weight: 1, stock: null }] },
  });
  const res = await spin({ tid: TID, drawId: 'd1' });
  assert.equal(res.win, false);
  assert.equal(res.coupon, null);
  assert.equal(res.pointsLeft, 70);
  assert.equal((await read(`tenants/${TID}/users/${uid}`)).data().points, 70, 'nothing ก็ยังต้องหักแต้ม');
  assert.equal((await listCoupons()).length, 0);
  assert.equal((await read(`tenants/${TID}/luckyDraws/d1`)).data().spins, 1);
});

// ── 6. สต็อกจำกัด → ตัดสต็อกจริง แล้วหมดในรอบถัดไป ───────────
test('stock=1 → หมุน 1 ครั้ง awarded=1, ครั้งที่ 2 รางวัลหมด', async () => {
  await seed({
    points: 100,
    draw: { name: 'จำกัด', active: true, costPoints: 10,
      prizes: [{ type: 'coupon', label: 'ชิ้นเดียว', weight: 1, stock: 1 }] },
  });
  const r1 = await spin({ tid: TID, drawId: 'd1' });
  assert.equal(r1.win, true);
  const d1 = await read(`tenants/${TID}/luckyDraws/d1`);
  assert.equal(d1.data().prizes[0].awarded, 1, 'awarded ต้อง +1');
  assert.equal(d1.data().spins, 1);

  // รอบ 2 : สต็อกหมด → failed-precondition, แต้มไม่ถูกหักเพิ่ม
  await expectFail({ tid: TID, drawId: 'd1' }, 'failed-precondition');
  assert.equal((await read(`tenants/${TID}/users/${uid}`)).data().points, 90, 'รอบ 2 ต้องไม่หักแต้มซ้ำ');
});

// ── 7. guard พื้นฐาน: ไม่ส่ง drawId / draw ไม่มีจริง ─────────
test('ไม่ส่ง drawId → invalid-argument', async () => {
  await seed({ points: 100, draw: { name: 'x', active: true, costPoints: 10, prizes: [] } });
  await expectFail({ tid: TID }, 'invalid-argument');
});
test('drawId ไม่มีจริง → not-found', async () => {
  await seed({ points: 100, draw: { name: 'x', active: true, costPoints: 10, prizes: [] } });
  await expectFail({ tid: TID, drawId: 'ไม่มี' }, 'not-found');
});
