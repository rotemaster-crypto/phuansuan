// ============================================================
//  ogPreview — Open Graph meta สำหรับลิงก์แชร์ (onRequest) e2e ผ่าน emulator
//  รัน (serial):
//    firebase emulators:exec --only functions,firestore,auth --project demo-bocean \
//      "node --test --test-concurrency=1 tests/ogpreview.test.js"
//  ล็อก: /s/<tid>/p|post/<id> → HTML มี og:title/og:image + redirect เข้า ?product=/?post=
//        · escape ค่า user (กัน XSS ใน meta) · ไม่พบ/พารามผิด → redirect ราก
// ============================================================
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp } from 'firebase/app';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';

const PROJECT = 'demo-bocean';
const FN = 'http://127.0.0.1:5001/' + PROJECT + '/asia-southeast1/ogPreview';
let env;

before(async () => {
  env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { host: '127.0.0.1', port: 8080 } });
  initializeApp({ projectId: PROJECT, apiKey: 'fake-api-key' });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'tenants/demo'), { status: 'active', name: 'ร้านเดโม' });
    await setDoc(doc(db, 'tenants/demo/settings/app'), { appName: 'ร้านเดโม' });
    await setDoc(doc(db, 'tenants/demo/products/o1'), {
      name: 'เสื้อยืด "คูล" <b>', price: 250, description: 'ผ้าฝ้าย   นุ่ม',
      image: 'https://firebasestorage.googleapis.com/v0/b/x/o/a.jpg?alt=media',
    });
    await setDoc(doc(db, 'tenants/demo/posts/p1'), { authorName: 'สมชาย', text: 'สวัสดีชาวสวน' });
  });
});
after(async () => { await env.cleanup(); });

async function get(path) {
  const r = await fetch(FN + path, { redirect: 'manual' });
  return { status: r.status, loc: r.headers.get('location'), body: r.status < 300 ? await r.text() : '' };
}

test('สินค้า → og:title (ชื่อ+ราคา) + og:image + redirect ?product=', async () => {
  const { body } = await get('/s/demo/p/o1');
  assert.match(body, /og:title/);
  assert.match(body, /฿250/, 'ราคาใน title');
  assert.match(body, /og:image" content="https:\/\/firebasestorage/, 'og:image https');
  assert.match(body, /summary_large_image/);
  assert.match(body, /[?&]product=o1/, 'redirect เข้า ?product=');
  assert.match(body, /og:site_name" content="ร้านเดโม"/);
});

test('escape ค่า user ใน meta (กัน XSS) — quote/angle ถูก escape', async () => {
  const { body } = await get('/s/demo/p/o1');
  assert.ok(!/content="[^"]*"[^>]*คูล/.test(body) || body.includes('&quot;'), 'quote ในชื่อต้องถูก escape');
  assert.match(body, /&quot;คูล&quot;/, 'double-quote → &quot;');
  assert.match(body, /&lt;b&gt;/, 'angle bracket → &lt;');
  assert.ok(!body.includes('name="เสื้อยืด "คูล"'), 'ต้องไม่มี quote ดิบหลุด attribute');
});

test('โพสต์ → og:title (ผู้เขียน) + redirect ?post=', async () => {
  const { body } = await get('/s/demo/post/p1');
  assert.match(body, /สมชาย/);
  assert.match(body, /สวัสดีชาวสวน/, 'desc = เนื้อโพสต์');
  assert.match(body, /[?&]post=p1/);
});

test('สินค้าไม่มีจริง → redirect 302 ราก (ไม่ throw)', async () => {
  const { status, loc } = await get('/s/demo/p/ไม่มี');
  assert.equal(status, 302);
  assert.ok(loc && loc.endsWith('/'), 'เด้งกลับหน้าแรก');
});

test('พารามผิด (type ไม่รู้จัก) → redirect 302', async () => {
  const { status } = await get('/s/demo/xxx/o1');
  assert.equal(status, 302);
});
