#!/usr/bin/env node
/* งานค้าง #1 — reconcile feature key: toggle 🛒 ใน admin ให้คุม `commerce` (key ที่แอปใช้จริง)
 * แทน `productLink` ที่ไม่ได้ gate อะไร → เปิด/ปิดร้านจาก admin มีผลจริง
 * admin.html: relabel + repoint map (load/save) · index.html: เพิ่ม label commerce
 * idempotent
 */
'use strict';
const fs = require('fs');
const NL = String.fromCharCode(10);
let CHANGED = false;
function die(m){ console.error('❌ '+m); process.exit(1); }
function read(p){ if(!fs.existsSync(p)) die('ไม่พบไฟล์: '+p); return fs.readFileSync(p,'utf8'); }
function cnt(s,sub){ return s.split(sub).length-1; }
function replaceOnce(file, src, OLD, NEW, done){
  if (src.indexOf(done) !== -1){ console.log('  • ข้าม (ทำแล้ว): '+done.slice(0,42)); return src; }
  const n = cnt(src, OLD);
  if (n !== 1) die(file+': anchor พบ '+n+' จุด (ต้อง 1): '+OLD.slice(0,55).replace(/\n/g,'⏎'));
  CHANGED = true; return src.replace(OLD, NEW);
}
function replaceAll(file, src, OLD, NEW, done, expect){
  if (src.indexOf(done) !== -1){ console.log('  • ข้าม (ทำแล้ว): '+done.slice(0,42)); return src; }
  const n = cnt(src, OLD);
  if (n !== expect) die(file+': anchor พบ '+n+' จุด (คาดว่า '+expect+'): '+OLD.slice(0,45));
  CHANGED = true; return src.split(OLD).join(NEW);
}

/* ===================== admin.html ===================== */
const ADM = 'admin.html';
let adm = read(ADM);

// A1: relabel toggle
adm = replaceOnce(ADM, adm,
  '<div class="toggle-label">🛒 Product Link</div><div class="toggle-sub">ลิงก์สินค้าร้านในโพส</div>',
  '<div class="toggle-label">🛒 ร้านค้า (Commerce)</div><div class="toggle-sub">เปิด-ปิดระบบร้านค้า + ตะกร้า</div>',
  '🛒 ร้านค้า (Commerce)');

// A2: repoint map ทั้ง load + save (เหมือนกัน 2 จุด)
adm = replaceAll(ADM, adm,
  "productLink:'feat-product'",
  "commerce:'feat-product'",
  "commerce:'feat-product'", 2);

fs.writeFileSync(ADM, adm);

/* ===================== index.html ===================== */
const IDX = 'index.html';
let idx = read(IDX);

// I1: เพิ่ม label 'ร้านค้า' ให้ commerce ใน in-app admin panel
idx = replaceOnce(IDX, idx,
  "aiDiagnosis: 'หมอพืช AI', proximityAlert: 'แจ้งเตือนพื้นที่', productLink: 'ลิงก์สินค้า',",
  "aiDiagnosis: 'หมอพืช AI', proximityAlert: 'แจ้งเตือนพื้นที่', productLink: 'ลิงก์สินค้า', commerce: 'ร้านค้า',",
  "commerce: 'ร้านค้า'");

fs.writeFileSync(IDX, idx);

console.log(CHANGED ? '✅ patch งานค้าง #1 (feature key) สำเร็จ' : '✅ ไม่มีอะไรเปลี่ยน (idempotent)');
