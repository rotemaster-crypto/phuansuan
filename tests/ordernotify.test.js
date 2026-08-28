// ============================================================
//  onOrderStatusNotify — trigger แจ้ง buyer เมื่อสถานะออเดอร์เปลี่ยน (e2e)
//  รัน (serial):
//    firebase emulators:exec --only functions,firestore,auth --project demo-bocean \
//      "node --test --test-concurrency=1 tests/ordernotify.test.js"
//  ล็อก: เปลี่ยน status → เขียน notification doc ให้ buyer (confirmed/shipped/completed/cancelled)
//        · shipped แนบเลขพัสดุ · pending_payment (ตอนสร้าง) ไม่แจ้ง · status ไม่เปลี่ยนไม่แจ้ง
// ============================================================
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInAnonymously } from 'firebase/auth';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, collection, getDocs, query, where } from 'firebase/firestore';

const PROJECT = 'demo-bocean';
const TID = 'demo';
const BUYER = 'buyer1';
let env;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

before(async () => {
  env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { host: '127.0.0.1', port: 8080 } });
  const app = initializeApp({ projectId: PROJECT, apiKey: 'fake-api-key' });
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  await signInAnonymously(auth);
});
after(async () => { await env.cleanup(); });

async function write(fn) { await env.withSecurityRulesDisabled(async (ctx) => { await fn(ctx.firestore()); }); }
// อ่าน notification ทั้งหมดของ buyer (query uid)
async function notifsFor(uid) {
  let out = [];
  await env.withSecurityRulesDisabled(async (ctx) => {
    const snap = await getDocs(query(collection(ctx.firestore(), `tenants/${TID}/notifications`), where('uid', '==', uid)));
    out = snap.docs.map((d) => d.data());
  });
  return out;
}
// รอ trigger เขียน notification (poll จน pred จริง หรือ timeout)
async function waitNotif(uid, pred, ms = 12000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const ns = await notifsFor(uid); const hit = ns.find(pred); if (hit) return hit; await sleep(250); }
  return (await notifsFor(uid)).find(pred) || null;
}
async function seedOrder(oid, status, extra) {
  await env.clearFirestore();
  await write(async (db) => {
    await setDoc(doc(db, `tenants/${TID}`), { status: 'active' });
    await setDoc(doc(db, `tenants/${TID}/orders/${oid}`), Object.assign({ status, userId: BUYER, items: [], total: 100 }, extra || {}));
  });
}

test('paid_review → confirmed: buyer ได้ notification "ยืนยันการชำระเงิน"', async () => {
  await seedOrder('o1', 'paid_review');
  await write(async (db) => { await updateDoc(doc(db, `tenants/${TID}/orders/o1`), { status: 'confirmed' }); });
  const n = await waitNotif(BUYER, (x) => /ยืนยันการชำระเงิน/.test(x.text || ''));
  assert.ok(n, 'ต้องมี notification confirmed');
  assert.equal(n.icon, 'order');
  assert.match(n.text, /#O1/, 'ต้องอ้างเลขออเดอร์');
});

test('confirmed → shipped + trackingNumber: notification แนบเลขพัสดุ', async () => {
  await seedOrder('o2', 'confirmed');
  await write(async (db) => { await updateDoc(doc(db, `tenants/${TID}/orders/o2`), { status: 'shipped', trackingNumber: 'TH999' }); });
  const n = await waitNotif(BUYER, (x) => /จัดส่งพัสดุแล้ว/.test(x.text || ''));
  assert.ok(n, 'ต้องมี notification shipped');
  assert.match(n.text, /TH999/, 'ต้องแนบเลขพัสดุ');
});

test('shipped → completed: notification "สำเร็จ"', async () => {
  await seedOrder('o3', 'shipped');
  await write(async (db) => { await updateDoc(doc(db, `tenants/${TID}/orders/o3`), { status: 'completed' }); });
  const n = await waitNotif(BUYER, (x) => /สำเร็จ/.test(x.text || ''));
  assert.ok(n, 'ต้องมี notification completed');
});

test('confirmed → cancelled: notification "ยกเลิก"', async () => {
  await seedOrder('o4', 'confirmed');
  await write(async (db) => { await updateDoc(doc(db, `tenants/${TID}/orders/o4`), { status: 'cancelled' }); });
  const n = await waitNotif(BUYER, (x) => /ยกเลิก/.test(x.text || ''));
  assert.ok(n, 'ต้องมี notification cancelled');
});

test('อัปเดต field อื่นโดย status ไม่เปลี่ยน → ไม่มี notification', async () => {
  await seedOrder('o5', 'confirmed');
  await write(async (db) => { await updateDoc(doc(db, `tenants/${TID}/orders/o5`), { note: 'แก้โน้ต' }); });
  await sleep(2000);   // ให้โอกาส trigger ยิง (ควรไม่ยิง)
  const ns = await notifsFor(BUYER);
  assert.equal(ns.length, 0, 'status ไม่เปลี่ยน = ไม่ควรแจ้ง');
});
