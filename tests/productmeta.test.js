// ============================================================
//  fetchProductMeta helpers — unit test (pure functions, ไม่ต้องใช้ emulator)
//  รัน:  node --test tests/productmeta.test.js
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const idx = require('../functions/index.js');
const safe = idx._isSafePublicUrl;
const parse = idx._parseProductMeta;

test('B14: DNS/IP guard — จำแนก IP ภายใน (กัน DNS-rebind)', () => {
  const priv = idx._ipIsPrivate;
  assert.equal(priv('8.8.8.8'), false);
  assert.equal(priv('172.200.0.1'), false);          // public
  assert.equal(priv('2001:4860:4860::8888'), false); // public IPv6
  assert.equal(priv('10.0.0.5'), true);
  assert.equal(priv('127.0.0.1'), true);
  assert.equal(priv('192.168.1.1'), true);
  assert.equal(priv('172.16.0.1'), true);
  assert.equal(priv('169.254.169.254'), true);       // cloud metadata
  assert.equal(priv('::1'), true);
  assert.equal(priv('fd00::1'), true);
  assert.equal(priv('fe80::1'), true);
});

test('SSRF guard — อนุญาตเฉพาะ http/https สาธารณะ', () => {
  assert.equal(safe('https://shopee.co.th/product/123/456'), true);
  assert.equal(safe('http://example.com/x'), true);
  assert.equal(safe('http://172.200.0.1/'), true);           // public range
  // block internal / loopback / link-local / metadata
  assert.equal(safe('http://localhost/x'), false);
  assert.equal(safe('http://127.0.0.1:8080/x'), false);
  assert.equal(safe('http://10.0.0.5/x'), false);
  assert.equal(safe('http://192.168.1.1/'), false);
  assert.equal(safe('http://172.16.0.1/'), false);
  assert.equal(safe('http://169.254.169.254/latest/meta-data'), false);
  assert.equal(safe('http://metadata.google.internal/'), false);
  assert.equal(safe('ftp://example.com/x'), false);
  assert.equal(safe('not a url'), false);
});

test('OG parser — ดึงชื่อ/รูป/ราคา/รายละเอียด (สไตล์ Shopee)', () => {
  const html = `<html><head>
    <meta property="og:title" content="ปุ๋ยอินทรีย์ DemeterRich 1 กก. | Shopee">
    <meta property="og:image" content="https://cf.shopee.co.th/file/abc123">
    <meta property="og:description" content="ปุ๋ยอินทรีย์บำรุงดิน &amp; พืช">
    <meta property="product:price:amount" content="180.00">
    <title>fallback</title></head></html>`;
  const r = parse(html, 'https://shopee.co.th/x');
  assert.ok(r.name.includes('ปุ๋ยอินทรีย์ DemeterRich'));
  assert.equal(r.image, 'https://cf.shopee.co.th/file/abc123');
  assert.equal(r.price, '180.00');
  assert.ok(r.description.includes('&') && !r.description.includes('&amp;'));
  assert.equal(r.found, true);
});

test('OG parser — รองรับ attribute สลับลำดับ + fallback <title> + ว่าง', () => {
  assert.equal(parse('<meta content="สินค้าทดสอบ" property="og:title">', 'x').name, 'สินค้าทดสอบ');
  const r = parse('<html><head><title>แค่ title</title></head></html>', 'x');
  assert.equal(r.name, 'แค่ title');
  assert.equal(r.found, true);
  assert.equal(parse('<html></html>', 'x').found, false);
});
