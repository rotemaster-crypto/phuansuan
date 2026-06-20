#!/usr/bin/env node
/* #4 — responsive desktop: ขยายใช้พื้นที่จอคอม + สินค้า 3-4 คอลัมน์ + feed อ่านง่าย
 * index.html ล้วน: เพิ่ม @media (min-width) ก่อน </style> · CSS-only · idempotent
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

const IDX = 'index.html';
let idx = read(IDX);

const MEDIA = [
'/* ── #4 Responsive: ขยายใช้พื้นที่จอคอม ── */',
'@media (min-width:820px){',
'  body{max-width:780px}',
'  .bottom-nav{max-width:780px}',
'  .cart-fab{max-width:560px}',
'  .prod-grid{grid-template-columns:repeat(3,1fr)}',
'  #screen-feed,#screen-community,#screen-profile{max-width:620px;margin-left:auto;margin-right:auto}',
'}',
'@media (min-width:1140px){',
'  body{max-width:1000px}',
'  .bottom-nav{max-width:1000px}',
'  .prod-grid{grid-template-columns:repeat(4,1fr)}',
'}',
'</style>'
].join(NL);

idx = replaceOnce(IDX, idx, '</style>', MEDIA, '#4 Responsive: ขยายใช้พื้นที่จอคอม');

fs.writeFileSync(IDX, idx);
console.log(CHANGED ? '✅ patch #4 สำเร็จ' : '✅ ไม่มีอะไรเปลี่ยน (idempotent)');
