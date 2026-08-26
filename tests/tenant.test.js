// ============================================================
//  resolveTid — e2e ผ่าน emulator (functions + firestore + auth)
//  รันด้วย:
//    firebase emulators:exec --only functions,firestore,auth --project demo-bocean \
//      "node --test tests/tenant.test.js"
//  ล็อกพฤติกรรม "fail-closed" ของ resolveTid (ลอต 1 / A4):
//    tid ว่าง/ไม่มีจริง/ถูก suspend หรืออ่านไม่ได้ = ปฏิเสธ (ไม่ fallback เงียบไป phuansuan)
//    ยกเว้น alias ที่จงใจ ('office' -> phuansuan)
//  หมายเหตุ: resolveTid มี in-memory cache 60 วิ ที่คงอยู่ข้ามเทสต์ใน process เดียว
//    -> ใช้ tid ไม่ซ้ำกันต่อเทสต์ เพื่อกัน cache ปนกัน
// ============================================================
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInAnonymously } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const PROJECT = 'demo-bocean';
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
  uid = cred.user.uid;
  // spinLuckyDraw เรียก resolveTid ตั้งแต่ต้น -> ใช้เป็นตัวยิงทดสอบ resolveTid
  spin = (data) => httpsCallable(functions, 'spinLuckyDraw')(data).then((r) => r.data);
});
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

// seed tenant + user + draw (ข้าม rules)
async function seedTenant(tid, { status = 'active', points = 100 } = {}) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `tenants/${tid}`), { status, name: tid });
    await setDoc(doc(db, `tenants/${tid}/users/${uid}`), { points, tier: 'bronze', banned: false });
    await setDoc(doc(db, `tenants/${tid}/luckyDraws/d1`), {
      name: 'draw', active: true, costPoints: 20,
      prizes: [{ type: 'coupon', label: 'x', weight: 1, stock: null, discountText: 'ลด 50' }],
    });
  });
}
async function read(path) {
  let out;
  await env.withSecurityRulesDisabled(async (ctx) => { out = await getDoc(doc(ctx.firestore(), path)); });
  return out;
}
async function expectFail(data, codeSuffix) {
  await assert.rejects(() => spin(data), (e) => {
    assert.match(String(e.code || ''), new RegExp(codeSuffix + '$'), `code ควรลงท้าย ${codeSuffix} แต่ได้ ${e.code}`);
    return true;
  });
}

test('tid ว่าง → invalid-argument (ไม่ fallback เงียบไป phuansuan)', async () => {
  await expectFail({ tid: '', drawId: 'd1' }, 'invalid-argument');
});

test('tid ไม่มี tenant doc → failed-precondition และข้อมูล phuansuan ต้องไม่ถูกแตะ', async () => {
  await seedTenant('phuansuan', { points: 100 }); // ธงมีข้อมูลจริง
  // เดิม: resolveTid('typo') fallback -> phuansuan แล้วหักแต้มลง phuansuan; ตอนนี้ต้อง reject ก่อน
  await expectFail({ tid: 'typo-abc-doesnotexist', drawId: 'd1' }, 'failed-precondition');
  const u = await read(`tenants/phuansuan/users/${uid}`);
  assert.equal(u.data().points, 100, 'แต้มของ phuansuan ต้องไม่ถูกแตะเมื่อ tid มั่ว (กัน data ไหลข้าม tenant)');
});

test('tenant ถูก suspend → failed-precondition', async () => {
  await seedTenant('susp-only', { status: 'suspended' });
  await expectFail({ tid: 'susp-only', drawId: 'd1' }, 'failed-precondition');
});

test("alias 'office' → resolve ไป phuansuan และทำงานบนข้อมูล phuansuan", async () => {
  await seedTenant('phuansuan', { points: 100 });
  const res = await spin({ tid: 'office', drawId: 'd1' });
  assert.equal(res.win, true, "office ต้อง resolve ไป phuansuan แล้วหมุนได้ (พฤติกรรม callable เดิมต้องไม่เปลี่ยน)");
  const u = await read(`tenants/phuansuan/users/${uid}`);
  assert.equal(u.data().points, 80, 'ต้องหักแต้มจาก user ของ phuansuan');
});
