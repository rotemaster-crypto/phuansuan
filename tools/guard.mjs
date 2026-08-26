#!/usr/bin/env node
// ============================================================
//  guard.mjs — รั้วกัน regression ของ hardening audit (เฟส 5)
//  รัน: node tools/guard.mjs   (exit 1 ถ้าเจอการละเมิด)
//  ทำงานด้วยการอ่านไฟล์ + เช็ค pattern (ไม่ต้องใช้ emulator) → เร็ว ใช้ใน CI ได้
//  จุดประสงค์: CLAUDE.md เป็น "ไกด์" แต่ไฟล์นี้ "บังคับ" — ถ้าใครแก้แล้วปลดล็อก
//  ช่องโหว่ที่ audit ปิดไปแล้ว CI จะแดงทันที
// ============================================================
import { readFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'); // windows-safe
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const violations = [];
const V = (rule, msg) => violations.push({ rule, msg });
const checked = [];

// ── A4: resolveTid ต้อง fail-closed (ห้าม fallback เงียบไป phuansuan) ──
{
  const s = read('functions/index.js');
  if (/return\s+["']phuansuan["']/.test(s)) {
    V('A4', 'functions/index.js: เจอ `return "phuansuan"` — resolveTid ต้อง throw ไม่ fallback เงียบ (fail-open)');
  }
  checked.push('A4 resolveTid fail-closed');
}

// ── A1: placeOrder ห้ามเชื่อ discountPct จาก client ──
{
  const s = read('functions/index.js');
  if (/Number\(\s*cli\.discountPct/.test(s)) {
    V('A1', 'functions/index.js: เจอ `Number(cli.discountPct)` — ส่วนลด tier ต้องคิดฝั่ง server จาก tier จริง');
  }
  checked.push('A1 discountPct server-side');
}

// ── A2: ห้าม interpolate URL ดิบใน url()/src ต้องผ่าน safeUrl()/escapeHtml() ──
{
  const s = read('index.html');
  // flag เฉพาะ "property access ดิบ" (${obj.field}) ที่อยู่ถัดจาก url( / src=" โดยตรง
  // — ปลอดภัยคือ ${safeUrl(...)} (มี '(' ไม่ใช่ '.') หรือ ${localVar} ที่ sanitize แล้ว
  const re = /(?:url\(['"]?|<img\s+src=['"])\$\{\s*([A-Za-z_$][\w$]*\.[\w$.?]+)/g;
  let m;
  while ((m = re.exec(s))) {
    const ln = s.slice(0, m.index).split('\n').length;
    V('A2', `index.html:${ln}: URL ถูก interpolate ดิบ (\${${m[1]}}) ใน url()/src — ต้องห่อด้วย safeUrl() (กัน stored-XSS)`);
  }
  checked.push('A2 URL escaped in innerHTML');
}

// ── A5: rules ห้าม client เขียน points ตัวเอง ──
{
  const s = read('firestore.rules');
  const forbid = "'points', 'tier', 'banned', 'postCount', 'helpCount', 'lastBonusDay'";
  if (!s.includes(forbid)) {
    V('A5', `firestore.rules: users update ต้องมี hasAny([${forbid}]) — กัน client mint แต้ม`);
  }
  if (!/get\('points',\s*0\)\s*==\s*0/.test(s)) {
    V('A5', "firestore.rules: users create ต้องบังคับ points == 0 (แต้มเริ่มต้องเป็น 0)");
  }
  checked.push('A5 points server-only');
}

// ── A8: rules ต้องไม่เปิด world-read เอกสารร้าน + settings/store ──
{
  const s = read('firestore.rules');
  if (!/allow get:\s*if\s+memberOf\(t\)\s*\|\|\s*canManage\(t\)/.test(s)) {
    V('A8', "firestore.rules: tenants/{t} ต้อง `allow get: if memberOf(t) || canManage(t)` (ห้าม read:if true — รั่ว adminLineIds/PII)");
  }
  if (!s.includes("doc != 'store'")) {
    V('A8', "firestore.rules: settings/{doc} ต้องกัน 'store' ไม่ให้อ่าน public (`doc != 'store' || canManage(t)`)");
  }
  checked.push('A8 tenant/store not world-readable');
}

// ── A10: tenantRequests create ต้อง login ──
{
  const s = read('firestore.rules');
  const block = (s.match(/match \/tenantRequests\/\{[^}]*\}\s*\{[\s\S]*?\n    \}/) || [''])[0];
  if (!/allow create:\s*if\s+signedIn\(\)/.test(block)) {
    V('A10', 'firestore.rules: tenantRequests create ต้องมี signedIn() (กันสแปมจากคนนอก)');
  }
  checked.push('A10 tenantRequests requires auth');
}

// ── A9: hosting main/office ต้องไม่ serve ไฟล์ dev/source ──
{
  const fb = JSON.parse(read('firebase.json'));
  const need = ['index.js', 'apply_*.js', 'seed_tenant.js'];
  for (const h of fb.hosting || []) {
    if (h.target === 'main' || h.target === 'office') {
      const ig = h.ignore || [];
      for (const n of need) {
        if (!ig.includes(n)) V('A9', `firebase.json: target "${h.target}" ignore ต้องมี "${n}" (กัน serve dev/source สาธารณะ)`);
      }
    }
  }
  checked.push('A9 no public serving of dev/source');
}

// ── A7: deploy ต้อง gate ด้วย test ──
{
  const s = read('.github/workflows/firebase-deploy.yml');
  const needs = (s.match(/\n\s*deploy:\s*\n\s*needs:\s*\[([^\]]*)\]/) || [, ''])[1]
    .split(',').map((x) => x.trim());
  for (const req of ['functions-e2e', 'rules-test', 'guard']) {
    if (!needs.includes(req)) {
      V('A7', `.github/workflows/firebase-deploy.yml: job deploy ต้อง needs "${req}" (test/guard แดง = ห้าม deploy)`);
    }
  }
  checked.push('A7 deploy gated on tests+guard');
}

// ── รายงาน ──
console.log('guard: ตรวจ ' + checked.length + ' กฎ:');
for (const c of checked) console.log('  • ' + c);
if (violations.length) {
  console.error('\n❌ พบการละเมิด ' + violations.length + ' จุด:');
  for (const v of violations) console.error('  [' + v.rule + '] ' + v.msg);
  console.error('\nดู CLAUDE.md หัวข้อ "ห้ามทำเด็ดขาด" ประกอบ');
  process.exit(1);
}
console.log('\n✅ ผ่านทุกกฎ — ไม่มี regression ของ audit');
