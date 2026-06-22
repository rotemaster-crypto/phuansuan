#!/usr/bin/env node
/* งานค้าง #3 — Node 20 → 22 (functions เป็น Gen2 ทั้งหมด รองรับ nodejs22)
 * functions/package.json: engines.node 20→22 · firebase.json: runtime nodejs20→nodejs22
 * deps เดิม (firebase-functions ^5.0.1 / admin ^12) ใช้กับ Node 22 ได้ — ไม่แตะโค้ด
 * idempotent
 */
'use strict';
const fs = require('fs');
let CHANGED = false;
function die(m){ console.error('❌ '+m); process.exit(1); }
function read(p){ if(!fs.existsSync(p)) die('ไม่พบไฟล์: '+p); return fs.readFileSync(p,'utf8'); }
function cnt(s,sub){ return s.split(sub).length-1; }
function replaceOnce(file, src, OLD, NEW, done){
  if (src.indexOf(done) !== -1){ console.log('  • ข้าม (ทำแล้ว): '+done.slice(0,42)); return src; }
  const n = cnt(src, OLD);
  if (n !== 1) die(file+': anchor พบ '+n+' จุด (ต้อง 1): '+OLD.slice(0,55));
  CHANGED = true; return src.replace(OLD, NEW);
}

// functions/package.json
const PKG = 'functions/package.json';
let pkg = read(PKG);
pkg = replaceOnce(PKG, pkg, '"engines": { "node": "20" }', '"engines": { "node": "22" }', '"node": "22"');
fs.writeFileSync(PKG, pkg);

// firebase.json
const FB = 'firebase.json';
let fb = read(FB);
fb = replaceOnce(FB, fb, '"runtime": "nodejs20"', '"runtime": "nodejs22"', '"runtime": "nodejs22"');
fs.writeFileSync(FB, fb);

console.log(CHANGED ? '✅ patch งานค้าง #3 (Node 22) สำเร็จ' : '✅ ไม่มีอะไรเปลี่ยน (idempotent)');
