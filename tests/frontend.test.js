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

// สกัด `function NAME(...) { ... }` ด้วยการจับคู่ปีกกา (ใช้ได้กับฟังก์ชันที่ไม่มี { ในสตริง)
function extractFn(name) {
  const re = new RegExp('function\\s+' + name + '\\s*\\(');
  const start = SRC.search(re);
  assert.ok(start >= 0, 'ไม่พบฟังก์ชัน ' + name + ' ใน index.html');
  const open = SRC.indexOf('{', start);
  let depth = 0;
  for (let j = open; j < SRC.length; j++) {
    if (SRC[j] === '{') depth++;
    else if (SRC[j] === '}') { depth--; if (depth === 0) return SRC.slice(start, j + 1); }
  }
  throw new Error('brace ไม่สมดุลใน ' + name);
}
// โหลดฟังก์ชันเข้า sandbox พร้อม global ที่ mock ให้
function load(names, globals = {}) {
  const ctx = vm.createContext(Object.assign({ URLSearchParams, console }, globals));
  const code = names.map(extractFn).join('\n') +
    '\n;globalThis.__x = {' + names.map((n) => n + ':' + n).join(',') + '};';
  vm.runInContext(code, ctx);
  return ctx.__x;
}

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
