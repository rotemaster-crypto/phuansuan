// ============================================================
//  origin helpers — unit test (ไม่ต้อง emulator)
//  รัน: node --test tests/origin.test.js
//  ครอบ: _hostMatchesPlatform (umbrella โฮสต์ร่ม) + _originHostAllowed (B5 per-brand)
//  หมายเหตุ: origin gate ถูกข้ามใน emulator (FUNCTIONS_EMULATOR) → e2e ครอบไม่ได้
//            จึง unit-test pure helper ที่ export ไว้โดยตรง
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fns from '../functions/index.js';
const { _originHostAllowed, _hostMatchesPlatform } = fns;

test('origin/_hostMatchesPlatform: exact host + apex/subdomain ของ root → true', () => {
  const hosts = ['phuansuan.web.app', 'bocean.web.app'];
  const roots = ['bocean.com'];
  assert.equal(_hostMatchesPlatform('phuansuan.web.app', hosts, roots), true, 'exact host');
  assert.equal(_hostMatchesPlatform('bocean.com', hosts, roots), true, 'apex ของ root');
  assert.equal(_hostMatchesPlatform('brandx.bocean.com', hosts, roots), true, 'subdomain ของ root');
  assert.equal(_hostMatchesPlatform('PHUANSUAN.WEB.APP', hosts, roots), true, 'case-insensitive');
});
test('origin/_hostMatchesPlatform: เว็บบุคคลที่สาม → false (กัน membership injection B5)', () => {
  const hosts = ['phuansuan.web.app'];
  const roots = ['bocean.com'];
  assert.equal(_hostMatchesPlatform('evil.com', hosts, roots), false);
  assert.equal(_hostMatchesPlatform('notbocean.com', hosts, roots), false, 'ไม่ใช่ subdomain จริง (endsWith ล้วนไม่พอ)');
  assert.equal(_hostMatchesPlatform('bocean.com.evil.com', hosts, roots), false, 'root อยู่กลาง = ไม่ใช่');
  assert.equal(_hostMatchesPlatform('', hosts, roots), false);
  assert.equal(_hostMatchesPlatform('x.com', [], []), false, 'ไม่มี hosts/roots → ไม่ผ่าน');
});
test('origin/_originHostAllowed: domains ว่าง=ผ่าน · มี domains=ต้องตรง (per-brand B5)', () => {
  assert.equal(_originHostAllowed('x.com', []), true, 'ยังไม่ตั้ง domains → ไม่บังคับ');
  assert.equal(_originHostAllowed('shop.co', ['shop.co']), true);
  assert.equal(_originHostAllowed('evil.com', ['shop.co']), false);
});
