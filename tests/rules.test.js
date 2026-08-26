// ============================================================
//  Firestore Security Rules — tenant isolation tests (Bocean)
//  รันด้วย: firebase emulators:exec --only firestore --project demo-bocean "node --test tests/rules.test.js"
//  (ดู README ใน tests/ + วิธีติดตั้งท้ายไฟล์)
// ============================================================
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

let env;

// ── contexts ──────────────────────────────────────────────
const guest      = () => env.unauthenticatedContext().firestore();
const memberA    = () => env.authenticatedContext('uA', { tenants: { brandA: true } }).firestore();
const memberB    = () => env.authenticatedContext('uB', { tenants: { brandB: true } }).firestore();
const tAdminA    = () => env.authenticatedContext('adA', { tenants: { brandA: true }, tadmin: { brandA: true } }).firestore();
const superAdmin = () => env.authenticatedContext('super', { admin: true }).firestore();

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-bocean',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

after(async () => { await env.cleanup(); });

// ป้อนข้อมูลตั้งต้นแบบข้าม rules ก่อนแต่ละเทสต์
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'tenants/brandA'), { name: 'Brand A' });
    await setDoc(doc(db, 'tenants/brandB'), { name: 'Brand B' });
    await setDoc(doc(db, 'tenants/brandA/users/uA'), { points: 0, tier: 'bronze', banned: false });
    await setDoc(doc(db, 'tenants/brandB/users/uB'), { points: 0, tier: 'bronze', banned: false });
    // brandB ตั้ง feed เป็น private → คนนอกแบรนด์อ่านโพสต์ไม่ได้
    await setDoc(doc(db, 'tenants/brandB/settings/app'), { feedPublic: false, postMode: 'public' });
    await setDoc(doc(db, 'tenants/brandB/posts/pB'), { authorId: 'uB' });
    await setDoc(doc(db, 'tenants/brandB/orders/o1'), { userId: 'uB', status: 'pending_payment' });
    // กลุ่มชุมชน: brandA public (settings/app ไม่มี = feedPublic default true), brandB private
    await setDoc(doc(db, 'tenants/brandA/groups/gA'), { name: 'Group A', memberCount: 0 });
    await setDoc(doc(db, 'tenants/brandB/groups/gB'), { name: 'Group B', memberCount: 0 });
    // สุ่มจับรางวัล (Activity Engine)
    await setDoc(doc(db, 'tenants/brandA/luckyDraws/dA'), { name: 'Draw A', active: true, costPoints: 20, prizes: [] });
    await setDoc(doc(db, 'tenants/brandB/luckyDraws/dB'), { name: 'Draw B', active: true, costPoints: 20, prizes: [] });
    await setDoc(doc(db, 'tenants/brandA/users/uA/coupons/cA'), { code: 'X1', used: false });
    await setDoc(doc(db, 'tenants/brandB/users/uB/coupons/cB'), { code: 'X2', used: false });
  });
});

// ── 1. อ่าน user ข้ามแบรนด์ = ปฏิเสธ ───────────────────────
test('member A อ่าน user ของ brand B = DENIED', async () => {
  await assertFails(getDoc(doc(memberA(), 'tenants/brandB/users/uB')));
});
test('member B อ่าน user ตัวเองใน brand B = OK', async () => {
  await assertSucceeds(getDoc(doc(memberB(), 'tenants/brandB/users/uB')));
});

// ── 2. สร้างโพสต์ข้ามแบรนด์ = ปฏิเสธ ───────────────────────
test('member A สร้างโพสต์ใน brand B = DENIED', async () => {
  await assertFails(setDoc(doc(memberA(), 'tenants/brandB/posts/pX'), { authorId: 'uA' }));
});
test('member A สร้างโพสต์ในแบรนด์ตัวเอง (brand A) = OK', async () => {
  await assertSucceeds(setDoc(doc(memberA(), 'tenants/brandA/posts/pA'), { authorId: 'uA' }));
});

// ── 3. guest เขียนไม่ได้ ───────────────────────────────────
test('guest สร้างโพสต์ = DENIED', async () => {
  await assertFails(setDoc(doc(guest(), 'tenants/brandA/posts/pG'), { authorId: 'anon' }));
});

// ── 4. อ่านโพสต์ private ข้ามแบรนด์ = ปฏิเสธ ────────────────
test('member A อ่านโพสต์ private ของ brand B = DENIED', async () => {
  await assertFails(getDoc(doc(memberA(), 'tenants/brandB/posts/pB')));
});
test('member B อ่านโพสต์ของแบรนด์ตัวเอง = OK', async () => {
  await assertSucceeds(getDoc(doc(memberB(), 'tenants/brandB/posts/pB')));
});

// ── 5. แก้ points/tier ตัวเองเกินสิทธิ์ = ปฏิเสธ ────────────
test('member A ปั๊ม points ตัวเอง (0→9999) = DENIED', async () => {
  await assertFails(updateDoc(doc(memberA(), 'tenants/brandA/users/uA'), { points: 9999 }));
});
test('member A แก้ tier ตัวเอง = DENIED', async () => {
  await assertFails(updateDoc(doc(memberA(), 'tenants/brandA/users/uA'), { tier: 'platinum' }));
});
// A5: ห้าม client ขยับ points/postCount/lastBonusDay ตัวเองแม้แต่นิดเดียว (เดิม +20/write ทำได้)
test('member A +5 แต้มตัวเอง (0→5) = DENIED (A5)', async () => {
  await assertFails(updateDoc(doc(memberA(), 'tenants/brandA/users/uA'), { points: 5 }));
});
test('member A แก้ postCount ตัวเอง = DENIED (A5)', async () => {
  await assertFails(updateDoc(doc(memberA(), 'tenants/brandA/users/uA'), { postCount: 100 }));
});
test('member A แก้ lastBonusDay ตัวเอง = DENIED (A5: กัน reset โบนัสรายวัน)', async () => {
  await assertFails(updateDoc(doc(memberA(), 'tenants/brandA/users/uA'), { lastBonusDay: '2000-01-01' }));
});
test('member A แก้ field ปลอดภัย (displayName) = ALLOWED', async () => {
  await assertSucceeds(updateDoc(doc(memberA(), 'tenants/brandA/users/uA'), { displayName: 'ชื่อใหม่' }));
});
// A5: สร้าง user doc ต้องเริ่มแต้ม 0 (กันสร้างมาพร้อมแต้ม)
test('สร้าง user ใหม่ด้วย points>0 = DENIED (A5)', async () => {
  const uNew = env.authenticatedContext('uNew', { tenants: { brandA: true } }).firestore();
  await assertFails(setDoc(doc(uNew, 'tenants/brandA/users/uNew'), { points: 20, tier: 'bronze' }));
});
test('สร้าง user ใหม่ด้วย points 0 = ALLOWED', async () => {
  const uNew = env.authenticatedContext('uNew', { tenants: { brandA: true } }).firestore();
  await assertSucceeds(setDoc(doc(uNew, 'tenants/brandA/users/uNew'), { points: 0, tier: 'bronze', banned: false }));
});

// ── 6. อ่านออเดอร์ของคนอื่น = ปฏิเสธ ───────────────────────
test('member A อ่านออเดอร์ของ uB (brand B) = DENIED', async () => {
  await assertFails(getDoc(doc(memberA(), 'tenants/brandB/orders/o1')));
});

// ── 7. สิทธิ์จัดการ (settings) แยกตามแบรนด์ ────────────────
test('member ธรรมดาเขียน settings = DENIED', async () => {
  await assertFails(setDoc(doc(memberA(), 'tenants/brandA/settings/app'), { feedPublic: true }));
});
test('tenant admin ของ A เขียน settings ของ A = OK', async () => {
  await assertSucceeds(setDoc(doc(tAdminA(), 'tenants/brandA/settings/app'), { feedPublic: true }));
});
test('tenant admin ของ A เขียน settings ของ B = DENIED (สิทธิ์ไม่ข้ามแบรนด์)', async () => {
  await assertFails(setDoc(doc(tAdminA(), 'tenants/brandB/settings/app'), { feedPublic: true }));
});

// ── 8. ยืนยันว่า root path ระดับบนถูกปิด (legacy ลบแล้ว) ────
test('root /users ระดับบนสุด = อ่าน DENIED (ไม่มี legacy rules แล้ว)', async () => {
  await assertFails(getDoc(doc(memberA(), 'users/uA')));
});
test('root /products ระดับบนสุด = อ่าน DENIED', async () => {
  await assertFails(getDoc(doc(guest(), 'products/p1')));
});

// ── 9. กลุ่มชุมชน (Community Groups) ───────────────────────
test('member ธรรมดาสร้างกลุ่ม = DENIED (แอดมินเท่านั้น)', async () => {
  await assertFails(setDoc(doc(memberA(), 'tenants/brandA/groups/gX'), { name: 'X' }));
});
test('tenant admin ของ A สร้างกลุ่มใน A = OK', async () => {
  await assertSucceeds(setDoc(doc(tAdminA(), 'tenants/brandA/groups/gX'), { name: 'X' }));
});
test('tenant admin ของ A สร้างกลุ่มใน B = DENIED (ไม่ข้ามแบรนด์)', async () => {
  await assertFails(setDoc(doc(tAdminA(), 'tenants/brandB/groups/gX'), { name: 'X' }));
});
test('member A เข้าร่วมกลุ่มในแบรนด์ตัวเอง (สมาชิกภาพตัวเอง) = OK', async () => {
  await assertSucceeds(setDoc(doc(memberA(), 'tenants/brandA/groups/gA/members/uA'), { joinedAt: 1 }));
});
test('member A เข้าร่วมกลุ่มใน brand B = DENIED (ข้ามแบรนด์)', async () => {
  await assertFails(setDoc(doc(memberA(), 'tenants/brandB/groups/gB/members/uA'), { joinedAt: 1 }));
});
test('member A เขียนสมาชิกภาพแทน uid อื่น = DENIED', async () => {
  await assertFails(setDoc(doc(memberA(), 'tenants/brandA/groups/gA/members/uB'), { joinedAt: 1 }));
});
test('member A อ่านกลุ่ม private ของ brand B = DENIED', async () => {
  await assertFails(getDoc(doc(memberA(), 'tenants/brandB/groups/gB')));
});

// ── 10. สุ่มจับรางวัล (Lucky Draw / Activity Engine) ───────
test('member ธรรมดาอ่านกล่องสุ่ม = OK (public read)', async () => {
  await assertSucceeds(getDoc(doc(memberA(), 'tenants/brandA/luckyDraws/dA')));
});
test('member ธรรมดาสร้าง/แก้กล่องสุ่ม = DENIED (แอดมินเท่านั้น)', async () => {
  await assertFails(setDoc(doc(memberA(), 'tenants/brandA/luckyDraws/dX'), { name: 'X', active: true }));
});
test('tenant admin ของ A สร้างกล่องสุ่มใน A = OK', async () => {
  await assertSucceeds(setDoc(doc(tAdminA(), 'tenants/brandA/luckyDraws/dX'), { name: 'X', active: true, costPoints: 10, prizes: [] }));
});
test('tenant admin ของ A สร้างกล่องสุ่มใน B = DENIED (ไม่ข้ามแบรนด์)', async () => {
  await assertFails(setDoc(doc(tAdminA(), 'tenants/brandB/luckyDraws/dX'), { name: 'X', active: true }));
});
test('member A แก้กล่องสุ่ม (ตัดสต็อก/หมุนเอง) = DENIED', async () => {
  await assertFails(updateDoc(doc(memberA(), 'tenants/brandA/luckyDraws/dA'), { spins: 999 }));
});
test('member A อ่านคูปองตัวเอง = OK', async () => {
  await assertSucceeds(getDoc(doc(memberA(), 'tenants/brandA/users/uA/coupons/cA')));
});
test('member A เขียนคูปองให้ตัวเอง (client) = DENIED (function เท่านั้น)', async () => {
  await assertFails(setDoc(doc(memberA(), 'tenants/brandA/users/uA/coupons/cX'), { code: 'HACK', used: false }));
});
test('member A อ่านคูปองของ uB ข้ามแบรนด์ = DENIED', async () => {
  await assertFails(getDoc(doc(memberA(), 'tenants/brandB/users/uB/coupons/cB')));
});

// ── B2: admin เปลี่ยน order.status ตรงจาก client = DENIED (ต้องผ่าน setOrderStatus) ──
test('B2: tenant admin เขียน order.status ตรง = DENIED', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'tenants/brandA/orders/oA'), { userId: 'x', status: 'paid_review' });
  });
  await assertFails(updateDoc(doc(tAdminA(), 'tenants/brandA/orders/oA'), { status: 'confirmed' }));
});
test('B2: tenant admin แก้ field อื่นของ order (status คงเดิม) = ALLOWED', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'tenants/brandA/orders/oA'), { userId: 'x', status: 'paid_review' });
  });
  await assertSucceeds(updateDoc(doc(tAdminA(), 'tenants/brandA/orders/oA'), { note: 'ตรวจแล้ว' }));
});

// ── B4: config เศรษฐกิจต้องเป็น number >= 0 (defense-in-depth) ──
test('B4: luckyDraw costPoints ติดลบ = DENIED', async () => {
  await assertFails(setDoc(doc(tAdminA(), 'tenants/brandA/luckyDraws/dNeg'), { name: 'x', active: true, costPoints: -5, prizes: [] }));
});
test('B4: luckyDraw costPoints เป็น string = DENIED', async () => {
  await assertFails(setDoc(doc(tAdminA(), 'tenants/brandA/luckyDraws/dStr'), { name: 'x', active: true, costPoints: '20', prizes: [] }));
});
test('B4: earnCampaign ตัวเลขถูกต้อง = ALLOWED', async () => {
  await assertSucceeds(setDoc(doc(tAdminA(), 'tenants/brandA/earnCampaigns/ecOk'), { trigger: 'purchase', active: true, ratePoints: 1, ratePerBaht: 100, minSpend: 0, multiplier: 2 }));
});
test('B4: earnCampaign multiplier ติดลบ = DENIED', async () => {
  await assertFails(setDoc(doc(tAdminA(), 'tenants/brandA/earnCampaigns/ecBad'), { trigger: 'purchase', active: true, ratePoints: 1, multiplier: -3 }));
});
test('B4: ลบ luckyDraw = ALLOWED (delete ไม่ต้อง validate)', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), 'tenants/brandA/luckyDraws/dDel'), { costPoints: 5 }); });
  await assertSucceeds(deleteDoc(doc(tAdminA(), 'tenants/brandA/luckyDraws/dDel')));
});

// ── A8: ปิด world-read ของเอกสารร้าน (PII: ownerLineId/adminLineIds) + settings/store ──
test('A8: guest อ่านเอกสารร้าน (tenants/brandA) = DENIED (เดิม public → รั่ว adminLineIds)', async () => {
  await assertFails(getDoc(doc(guest(), 'tenants/brandA')));
});
test('A8: member A อ่านเอกสารร้านตัวเอง = OK', async () => {
  await assertSucceeds(getDoc(doc(memberA(), 'tenants/brandA')));
});
test('A8: super-admin อ่านเอกสารร้านใด ๆ = OK', async () => {
  await assertSucceeds(getDoc(doc(superAdmin(), 'tenants/brandA')));
});
test('A8: guest อ่าน settings/store (ที่อยู่/เบอร์ผู้ส่ง) = DENIED', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'tenants/brandA/settings/store'), { phone: '08x', addressLine: 'secret' });
  });
  await assertFails(getDoc(doc(guest(), 'tenants/brandA/settings/store')));
});
test('A8: tenant admin อ่าน settings/store ร้านตัวเอง = OK', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'tenants/brandA/settings/store'), { phone: '08x' });
  });
  await assertSucceeds(getDoc(doc(tAdminA(), 'tenants/brandA/settings/store')));
});
test('A8: settings อื่น (app) ยัง public — guest อ่านได้', async () => {
  await assertSucceeds(getDoc(doc(guest(), 'tenants/brandB/settings/app')));  // seeded ใน beforeEach
});

// ── A10: tenantRequests create ต้อง login (กันสแปมจากคนนอก) ──
const validReq = { status: 'new', brandName: 'ร้านใหม่', contactName: 'สมชาย', phone: '0812345678' };
test('A10: guest (ไม่ login) สร้าง tenantRequest = DENIED', async () => {
  await assertFails(setDoc(doc(guest(), 'tenantRequests/r1'), validReq));
});
test('A10: ผู้ใช้ที่ login แล้วสร้าง tenantRequest = OK', async () => {
  await assertSucceeds(setDoc(doc(memberA(), 'tenantRequests/r2'), validReq));
});
