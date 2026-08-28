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
test('frontend/tenantId: live domain map (BYOD) ชนะ config.js static', () => {
  const APP_CONFIG = { tenant: { id: 'phuansuan', domains: { 'shop.co': 'oldbrand' } } };
  const location = { search: '', hostname: 'shop.co' };
  const _liveDomains = { 'shop.co': 'newbrand' };   // super ผูกโดเมนสด
  const { tenantId } = load(['tenantId'], { APP_CONFIG, location, _liveDomains });
  assert.equal(tenantId(), 'newbrand', 'live map ต้องมาก่อน static config');
});
test('frontend/tenantId: path bocean.com/brandx → tid=brandx (host ไม่ผูกร้าน)', () => {
  const APP_CONFIG = { tenant: { id: 'phuansuan', domains: {} } };
  const location = { search: '', hostname: 'bocean.com', pathname: '/brandx' };
  const { tenantId, isPlausibleTid } = load(['tenantId', 'isPlausibleTid'], { APP_CONFIG, location });
  assert.equal(tenantId(), 'brandx');
});
test('frontend/tenantId: path คำสงวน (/admin) → ไม่ใช่ tid → default', () => {
  const APP_CONFIG = { tenant: { id: 'phuansuan', domains: {} } };
  const location = { search: '', hostname: 'bocean.com', pathname: '/admin' };
  const { tenantId, isPlausibleTid } = load(['tenantId', 'isPlausibleTid'], { APP_CONFIG, location });
  assert.equal(tenantId(), 'phuansuan');
});
test('frontend/tenantId: ?t= ยังชนะ path', () => {
  const APP_CONFIG = { tenant: { id: 'phuansuan', domains: {} } };
  const location = { search: '?t=explicit', hostname: 'bocean.com', pathname: '/brandx' };
  const { tenantId, isPlausibleTid } = load(['tenantId', 'isPlausibleTid'], { APP_CONFIG, location });
  assert.equal(tenantId(), 'explicit');
});
// ── subdomain resolve (brandx.bocean.com) — domain-agnostic ──
test('frontend/subdomainTid: <sub>.<root> → sub · apex/คำสงวน/หลาย label → ""', () => {
  const { subdomainTid, isPlausibleTid } = load(['subdomainTid', 'isPlausibleTid']);
  assert.equal(subdomainTid('brandx.bocean.com', ['bocean.com']), 'brandx');
  assert.equal(subdomainTid('my-shop.bocean.com', ['bocean.com']), 'my-shop');
  assert.equal(subdomainTid('bocean.com', ['bocean.com']), '', 'apex = ไม่ใช่ร้าน');
  assert.equal(subdomainTid('www.bocean.com', ['bocean.com']), '', 'www สงวน');
  assert.equal(subdomainTid('a.b.bocean.com', ['bocean.com']), '', 'หลาย label ไม่เอา');
  assert.equal(subdomainTid('brandx.other.com', ['bocean.com']), '', 'คนละ root');
});
test('frontend/subdomainTid: domain-agnostic — เปลี่ยน root ได้ทันที', () => {
  const { subdomainTid, isPlausibleTid } = load(['subdomainTid', 'isPlausibleTid']);
  assert.equal(subdomainTid('shop1.mystore.app', ['mystore.app']), 'shop1', 'root อื่นก็ทำงาน');
  assert.equal(subdomainTid('shop1.a.com', ['a.com', 'b.com']), 'shop1', 'หลาย root');
  assert.equal(subdomainTid('x.bocean.com', []), '', 'ไม่ตั้ง root → inert');
});
test('frontend/tenantId: subdomain brandx.bocean.com → brandx (ผ่าน _platformRoots)', () => {
  const APP_CONFIG = { tenant: { id: 'phuansuan', domains: {} } };
  const location = { search: '', hostname: 'brandx.bocean.com', pathname: '/' };
  const _platformRoots = ['bocean.com'];
  const { tenantId, subdomainTid, isPlausibleTid } = load(['tenantId', 'subdomainTid', 'isPlausibleTid'], { APP_CONFIG, location, _platformRoots });
  assert.equal(tenantId(), 'brandx');
});
test('frontend/isPlausibleTid: slug ผ่าน · คำสงวน/ไฟล์/format ผิด ไม่ผ่าน', () => {
  const { isPlausibleTid } = load(['isPlausibleTid']);
  assert.equal(isPlausibleTid('brandx'), true);
  assert.equal(isPlausibleTid('my-shop-2'), true);
  assert.equal(isPlausibleTid('admin'), false, 'คำสงวน');
  assert.equal(isPlausibleTid('s'), false, 'OG prefix');
  assert.equal(isPlausibleTid('config.js'), false, 'มีจุด (ไฟล์)');
  assert.equal(isPlausibleTid('A'), false, 'สั้นไป/ตัวใหญ่');
  assert.equal(isPlausibleTid(''), false);
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

// ── productMatchesQuery (customer shop search) — ชื่อ+รายละเอียด ──
test('frontend/productMatchesQuery: ค้นชื่อ/รายละเอียด · ว่าง=ผ่านหมด', () => {
  const { productMatchesQuery } = load(['productMatchesQuery']);
  const p = { name: 'เสื้อยืดคอกลม', desc: 'ผ้าฝ้าย 100%' };
  assert.equal(productMatchesQuery(p, ''), true, 'ไม่ค้น=ผ่านหมด');
  assert.equal(productMatchesQuery(p, 'เสื้อ'), true);
  assert.equal(productMatchesQuery(p, 'ฝ้าย'), true, 'match รายละเอียด');
  assert.equal(productMatchesQuery(p, 'กางเกง'), false);
  assert.equal(productMatchesQuery({ name: 'X' }, 'x'), true, 'case-insensitive + ไม่มี desc');
});

// ── effectiveCats / platformCatOf (หมวด 2 ชั้น marketplace-ready) ──
test('categories/effectiveCats: fallback brand→platform→config + normalize', () => {
  const { effectiveCats } = loadAdmin(['effectiveCats']);
  const cfg = [{ id: 'fashion', name: 'แฟชั่น', emoji: '👕' }];
  const plat = [{ id: 'p1', name: 'หมวดกลาง', emoji: '🎯' }];
  const brand = [{ id: 'b1', name: 'หมวดร้าน', emoji: '🛍️', platformCat: 'p1', order: 0 }];
  // brand ชนะเมื่อมี
  const eb = effectiveCats(brand, plat, cfg);
  assert.equal(eb.length, 1); assert.equal(eb[0].id, 'b1'); assert.equal(eb[0].platformCat, 'p1');
  // ไม่มี brand → platform (platformCat=id)
  const ep = effectiveCats(null, plat, cfg);
  assert.equal(ep[0].id, 'p1'); assert.equal(ep[0].platformCat, 'p1', 'fallback: canonical=ตัวเอง');
  // ไม่มีทั้งคู่ → config (platformCat=id, emoji default คงของ config)
  const ec = effectiveCats([], [], cfg);
  assert.equal(ec[0].id, 'fashion'); assert.equal(ec[0].platformCat, 'fashion');
});
test('categories/effectiveCats: เรียงตาม order + ตัด item ไม่มี id', () => {
  const { effectiveCats } = loadAdmin(['effectiveCats']);
  const out = effectiveCats([{ id: 'b', name: 'B', order: 2 }, { id: 'a', name: 'A', order: 1 }, { name: 'ไม่มี id' }], null, []);
  assert.equal(out.length, 2, 'ตัดตัวไม่มี id');
  assert.equal(out[0].id, 'a'); assert.equal(out[1].id, 'b');
});
test('categories/platformCatOf: brand id → canonical · ไม่พบ → คืน id เดิม', () => {
  const { effectiveCats, platformCatOf } = loadAdmin(['effectiveCats', 'platformCatOf', 'catInfo']);
  const cats = effectiveCats([{ id: 'b1', name: 'X', platformCat: 'fashion' }], null, []);
  assert.equal(platformCatOf('b1', cats), 'fashion');
  assert.equal(platformCatOf('unknown', cats), 'unknown', 'ไม่พบ → คืน id เดิม (treated as canonical)');
});

// ── _normHost (admin) — normalize โดเมนก่อนเก็บ ──
test('admin/_normHost: ตัด scheme/path + lowercase', () => {
  const { _normHost } = loadAdmin(['_normHost']);
  assert.equal(_normHost('https://Shop.Example.com/path?x=1'), 'shop.example.com');
  assert.equal(_normHost('  SHOP.CO  '), 'shop.co');
  assert.equal(_normHost('http://a.b.co/'), 'a.b.co');
});
