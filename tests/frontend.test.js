// ============================================================
//  Frontend logic tests (B13) — ทดสอบฟังก์ชันจริงใน index.html
//  รัน: node --test tests/frontend.test.js   (ไม่ต้อง emulator/browser/deps)
//  วิธี: สกัด source ของฟังก์ชันจาก index.html แล้วรันใน vm sandbox
//        (ทดสอบโค้ดจริง ไม่ใช่สำเนา) — index.html เป็น monolith รัน jsdom เต็มหน้า
//        จะชนกับ init-on-load จึงสกัดเฉพาะฟังก์ชันที่ต้องการ
//  ครอบ: safeUrl (A2 XSS), escapeHtml, tenantId (tenant resolution)
//  ข้อจำกัด: ทดสอบได้เฉพาะฟังก์ชัน pure/มี global น้อย — DOM-wiring ต้องใช้ browser (ยังไม่ทำ)
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SRC = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const SRC_ADMIN = readFileSync(new URL('../admin.html', import.meta.url), 'utf8');

// สกัด `function NAME(...) { ... }` ด้วยการจับคู่ปีกกา (ใช้ได้กับฟังก์ชันที่ไม่มี { ในสตริง)
function extractFnFrom(src, name, label) {
  const re = new RegExp('function\\s+' + name + '\\s*\\(');
  const start = src.search(re);
  assert.ok(start >= 0, 'ไม่พบฟังก์ชัน ' + name + ' ใน ' + label);
  const open = src.indexOf('{', start);
  let depth = 0;
  for (let j = open; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(start, j + 1); }
  }
  throw new Error('brace ไม่สมดุลใน ' + name);
}
const extractFn = (name) => extractFnFrom(SRC, name, 'index.html');
// โหลดฟังก์ชันจาก source ที่กำหนดเข้า sandbox พร้อม global ที่ mock ให้
function loadFrom(src, label, names, globals = {}) {
  const ctx = vm.createContext(Object.assign({ URLSearchParams, console }, globals));
  const code = names.map((n) => extractFnFrom(src, n, label)).join('\n') +
    '\n;globalThis.__x = {' + names.map((n) => n + ':' + n).join(',') + '};';
  vm.runInContext(code, ctx);
  return ctx.__x;
}
const load = (names, globals = {}) => loadFrom(SRC, 'index.html', names, globals);
const loadAdmin = (names, globals = {}) => loadFrom(SRC_ADMIN, 'admin.html', names, globals);

// ── safeUrl (A2) — ด่านกัน stored-XSS ──
test('frontend/safeUrl: อนุญาต url รูปจริง, block payload XSS', () => {
  const { safeUrl } = load(['safeUrl']);
  assert.equal(safeUrl('https://firebasestorage.googleapis.com/v0/b/p/o/a.jpg?alt=media&token=x'),
    'https://firebasestorage.googleapis.com/v0/b/p/o/a.jpg?alt=media&token=x');
  assert.equal(safeUrl('https://lh3.googleusercontent.com/a=s96'), 'https://lh3.googleusercontent.com/a=s96');
  assert.equal(safeUrl('https://x.com/a.jpg");alert(1)//'), '', 'มี quote+() ต้อง block');
  assert.equal(safeUrl('https://x.com/a onerror=alert(1)'), '', 'มี space ต้อง block');
  assert.equal(safeUrl('javascript:alert(1)'), '', 'scheme อันตราย');
  assert.equal(safeUrl('data:image/svg+xml,<svg onload=alert(1)>'), '', 'data-svg');
  assert.equal(safeUrl(null), '');
});

// ── escapeHtml ──
test('frontend/escapeHtml: escape อักขระ HTML', () => {
  const { escapeHtml } = load(['escapeHtml']);
  assert.equal(escapeHtml('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(escapeHtml('a & "b" \'c\''), 'a &amp; &quot;b&quot; &#39;c&#39;');
  assert.equal(escapeHtml(null), '');
});

// ── tenantId — ลำดับ: ?t= > domain map > default ──
test('frontend/tenantId: ?t= override', () => {
  const APP_CONFIG = { tenant: { id: 'phuansuan', domains: { 'phuansuan.web.app': 'phuansuan' } } };
  const location = { search: '?t=brandX', hostname: 'phuansuan.web.app' };
  const { tenantId } = load(['tenantId'], { APP_CONFIG, location });
  assert.equal(tenantId(), 'brandX', 'query param ต้องมาก่อน');
});
test('frontend/tenantId: domain map', () => {
  const APP_CONFIG = { tenant: { id: 'phuansuan', domains: { 'office-phuansuan.web.app': 'office' } } };
  const location = { search: '', hostname: 'office-phuansuan.web.app' };
  const { tenantId } = load(['tenantId'], { APP_CONFIG, location });
  assert.equal(tenantId(), 'office');
});
test('frontend/tenantId: default เมื่อไม่แมตช์', () => {
  const APP_CONFIG = { tenant: { id: 'phuansuan', domains: {} } };
  const location = { search: '', hostname: 'unknown.example.com' };
  const { tenantId } = load(['tenantId'], { APP_CONFIG, location });
  assert.equal(tenantId(), 'phuansuan');
});

// ── courierTrack — รหัสขนส่ง → ชื่อ + ลิงก์ติดตาม ──
test('frontend/courierTrack: รหัสรู้จัก → ชื่อ + ลิงก์ต่อเลขพัสดุ', () => {
  const { courierTrack } = load(['courierTrack']);
  const flash = courierTrack('FLE', 'TH123');
  assert.equal(flash.name, 'Flash Express');
  assert.equal(flash.url, 'https://www.flashexpress.com/fle/tracking?se=TH123');
  // case-insensitive + ชื่อไทยเป็น key ได้
  assert.equal(courierTrack('thaipost', 'EA1').name, 'ไปรษณีย์ไทย');
  assert.ok(courierTrack('thaipost', 'EA1').url.endsWith('trackNumber=EA1'));
});
test('frontend/courierTrack: เลขพัสดุถูก encode (กัน url แตก)', () => {
  const { courierTrack } = load(['courierTrack']);
  assert.equal(courierTrack('KEX', 'A B&C').url, 'https://th.kerryexpress.com/th/track/?track=A%20B%26C');
});
test('frontend/courierTrack: รหัสไม่รู้จัก/ว่าง หรือขนส่งไม่มี url → url:null (ไม่เดาลิงก์)', () => {
  const { courierTrack } = load(['courierTrack']);
  const empty = courierTrack('', 'X1');
  assert.equal(empty.name, ''); assert.equal(empty.url, null);
  const weird = courierTrack('WEIRD', 'X1');
  assert.equal(weird.name, ''); assert.equal(weird.url, null);
  const spx = courierTrack('SPX', 'X1');
  assert.equal(spx.name, 'SPX Express');
  assert.equal(spx.url, null, 'SPX ยังไม่ยืนยัน url → null');
});
test('frontend/courierTrack: มีชื่อขนส่งแต่ไม่มีเลข → url:null', () => {
  const { courierTrack } = load(['courierTrack']);
  assert.equal(courierTrack('FLE', '').url, null);
});

// ── teamMemberView (admin.html) — LINE id + user doc → ข้อมูลแสดงผล ──
test('admin/teamMemberView: user doc มี → ชื่อ+avatar+resolved', () => {
  const { teamMemberView } = loadAdmin(['teamMemberView']);
  const v = teamMemberView('U1', { displayName: 'สมชาย', photoUrl: 'https://x/y.jpg' }, 'Uowner');
  assert.equal(v.name, 'สมชาย');
  assert.equal(v.photo, 'https://x/y.jpg');
  assert.equal(v.initial, 'ส');
  assert.equal(v.isOwner, false);
  assert.equal(v.resolved, true);
});
test('admin/teamMemberView: ยังไม่เคย login (u=null) → resolved:false + fallback', () => {
  const { teamMemberView } = loadAdmin(['teamMemberView']);
  const v = teamMemberView('U2', null, 'Uowner');
  assert.equal(v.name, 'ยังไม่เคยเข้าระบบ');
  assert.equal(v.initial, '?');
  assert.equal(v.resolved, false);
  assert.equal(v.photo, '');
});
test('admin/teamMemberView: uid === ownerLineId → isOwner:true', () => {
  const { teamMemberView } = loadAdmin(['teamMemberView']);
  assert.equal(teamMemberView('Uowner', { displayName: 'เจ้าของ' }, 'Uowner').isOwner, true);
  assert.equal(teamMemberView('U9', {}, '').isOwner, false, 'ownerLineId ว่าง → ไม่ใช่เจ้าของ');
});

// ── parseStreakMilestones (admin.html) — "days:points" ต่อบรรทัด → milestones เรียง ──
test('admin/parseStreakMilestones: parse + เรียงตามวัน + กรองบรรทัดเสีย', () => {
  const { parseStreakMilestones } = loadAdmin(['parseStreakMilestones']);
  const out = parseStreakMilestones('7:100\n3:30\nขยะ\n:50\n30:500');
  assert.equal(out.length, 3, 'ตัดบรรทัดเสีย เหลือ 3');
  assert.equal(out[0].days, 3); assert.equal(out[1].days, 7); assert.equal(out[2].days, 30);   // เรียงน้อย→มาก
  assert.equal(out[0].rewardPoints, 30);
  assert.equal(out[2].rewardPoints, 500);
});
test('admin/parseStreakMilestones: ว่าง → []; days<=0 ถูกตัด', () => {
  const { parseStreakMilestones } = loadAdmin(['parseStreakMilestones']);
  assert.equal(parseStreakMilestones('').length, 0);
  assert.equal(parseStreakMilestones('0:100\n-3:50').length, 0, 'days<=0 ตัดทิ้ง');
});

// ── orderInDateRange (admin.html) — กรองออเดอร์ตามช่วงวัน (local) ──
test('admin/orderInDateRange: ในช่วง/นอกช่วง/ขอบเขตเปิด', () => {
  const { orderInDateRange } = loadAdmin(['orderInDateRange']);
  const o = { createdAt: { seconds: Math.floor(new Date('2026-06-15T12:00:00').getTime() / 1000) } };
  assert.equal(orderInDateRange(o, '', ''), true, 'ไม่ใส่ช่วง = ผ่านหมด');
  assert.equal(orderInDateRange(o, '2026-06-15', '2026-06-15'), true, 'วันเดียวกันครอบทั้งวัน');
  assert.equal(orderInDateRange(o, '2026-06-16', ''), false, 'ก่อน from');
  assert.equal(orderInDateRange(o, '', '2026-06-14'), false, 'หลัง to');
  assert.equal(orderInDateRange(o, '2026-06-01', '2026-06-30'), true, 'อยู่ในช่วง');
});
test('admin/orderInDateRange: ไม่มี createdAt → ตกช่วงเมื่อกรอง, ผ่านเมื่อไม่กรอง', () => {
  const { orderInDateRange } = loadAdmin(['orderInDateRange']);
  assert.equal(orderInDateRange({}, '2026-06-01', ''), false);
  assert.equal(orderInDateRange({}, '', ''), true);
});
