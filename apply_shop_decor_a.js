#!/usr/bin/env node
/* #3 เฟส A — ตกแต่งร้าน: แบนเนอร์หัวร้าน + แถบโปรโมชัน (settings/shop)
 * แก้ index.html (CSS+HTML+JS) + admin.html (sidebar+section+loaders+funcs)
 * idempotent · ไม่แตะ rules (settings/{doc} เป็น wildcard อยู่แล้ว)
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

/* ===================== index.html ===================== */
const IDX = 'index.html';
let idx = read(IDX);

// IDX-1: CSS แบนเนอร์ + โปรโมชัน (แทรกก่อน .shop-head{)
const CSS_OLD = '.shop-head{padding:12px;background:#fff;border-bottom:8px solid var(--bg)}';
const CSS_NEW = [
'#shop-banner{position:relative;min-height:118px;display:flex;flex-direction:column;justify-content:flex-end;padding:14px 16px;color:#fff;background:linear-gradient(135deg,var(--primary,#1877f2),#42b883);background-size:cover;background-position:center}',
'#shop-banner::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.04),rgba(0,0,0,.45))}',
'#shop-banner .sb-inner{position:relative;z-index:1}',
'#shop-banner .sb-title{font-size:21px;font-weight:800;text-shadow:0 1px 4px rgba(0,0,0,.35);line-height:1.2}',
'#shop-banner .sb-tag{font-size:13px;opacity:.96;margin-top:3px;text-shadow:0 1px 3px rgba(0,0,0,.35)}',
'#shop-promo{display:flex;align-items:center;gap:8px;background:#fff7e6;border-bottom:1px solid #ffe0a3;color:#a15c00;font-size:13px;font-weight:600;padding:9px 14px}',
'#shop-promo .pp-ico{flex:0 0 auto}',
'#shop-promo .pp-txt{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
'.shop-head{padding:12px;background:#fff;border-bottom:8px solid var(--bg)}'
].join(NL);
idx = replaceOnce(IDX, idx, CSS_OLD, CSS_NEW, '#shop-banner{position:relative');

// IDX-2: HTML แบนเนอร์ + โปรโมชัน (แทรกหลังเปิด screen-shop)
const HTML_OLD = '<div class="screen active" id="screen-shop">';
const HTML_NEW = [
'<div class="screen active" id="screen-shop">',
'  <div id="shop-banner" style="display:none"><div class="sb-inner"><div class="sb-title" id="shop-banner-title"></div><div class="sb-tag" id="shop-banner-tag"></div></div></div>',
'  <div id="shop-promo" style="display:none"><span class="pp-ico">📣</span><span class="pp-txt" id="shop-promo-txt"></span></div>'
].join(NL);
idx = replaceOnce(IDX, idx, HTML_OLD, HTML_NEW, 'id="shop-banner" style="display:none"');

// IDX-3: listener settings/shop (แทรกหลัง listener points)
const LIS_OLD = [
"    err => { console.warn('pointsSettings:', err.message); }",
"  );"
].join(NL);
const LIS_NEW = [
"    err => { console.warn('pointsSettings:', err.message); }",
"  );",
"  // #3A: settings/shop → แบนเนอร์ + โปรโมชัน (real-time)",
"  db.collection('settings').doc('shop').onSnapshot(",
"    snap => { applyShop(snap.exists ? snap.data() : {}); },",
"    err => { console.warn('shopSettings:', err.message); }",
"  );"
].join(NL);
idx = replaceOnce(IDX, idx, LIS_OLD, LIS_NEW, "doc('shop').onSnapshot");

// IDX-4: ฟังก์ชัน applyShop (แทรกก่อน // ---- Admin Panel ----)
const FN_OLD = '// ---- Admin Panel ----';
const FN_NEW = [
'function applyShop(d) {',
'  d = d || {};',
'  APP_CONFIG.shopDecor = d;',
'  var bn = document.getElementById("shop-banner");',
'  if (bn) {',
'    var on = d.bannerOn !== false;',
'    bn.style.display = on ? "flex" : "none";',
'    if (on) {',
'      var title = d.bannerTitle || (APP_CONFIG.shop && APP_CONFIG.shop.name) || "🛒 ร้านค้า";',
'      var tag = d.bannerTagline || "";',
'      var t1 = document.getElementById("shop-banner-title"); if (t1) t1.textContent = title;',
'      var t2 = document.getElementById("shop-banner-tag"); if (t2) { t2.textContent = tag; t2.style.display = tag ? "" : "none"; }',
'      if (d.coverImage) { bn.style.backgroundImage = "url(\\"" + d.coverImage + "\\")"; }',
'      else { var c1 = d.coverColor1 || "var(--primary,#1877f2)"; var c2 = d.coverColor2 || "#42b883"; bn.style.background = "linear-gradient(135deg," + c1 + "," + c2 + ")"; }',
'    }',
'  }',
'  var pr = document.getElementById("shop-promo");',
'  if (pr) {',
'    var pon = d.promoOn !== false && !!d.promoText;',
'    pr.style.display = pon ? "flex" : "none";',
'    if (pon) { var pt = document.getElementById("shop-promo-txt"); if (pt) pt.textContent = d.promoText; }',
'  }',
'}',
'',
'// ---- Admin Panel ----'
].join(NL);
idx = replaceOnce(IDX, idx, FN_OLD, FN_NEW, 'function applyShop(d) {');

fs.writeFileSync(IDX, idx);

/* ===================== admin.html ===================== */
const ADM = 'admin.html';
let adm = read(ADM);

// ADM-1: sidebar item (ก่อน สินค้า)
const SB_OLD = '    <div class="sb-item" onclick="showScreen(\'products\',this)"><span class="si">📦</span> สินค้า</div>';
const SB_NEW = [
'    <div class="sb-item" onclick="showScreen(\'shopdecor\',this)"><span class="si">🛍️</span> ตกแต่งร้าน</div>',
'    <div class="sb-item" onclick="showScreen(\'products\',this)"><span class="si">📦</span> สินค้า</div>'
].join(NL);
adm = replaceOnce(ADM, adm, SB_OLD, SB_NEW, "showScreen('shopdecor',this)");

// ADM-2: section markup (ก่อน <!-- PRODUCTS -->)
const SEC_OLD = '<!-- PRODUCTS -->';
const SEC_NEW = [
'<div class="screen" id="screen-shopdecor">',
'  <div class="page-header"><div class="page-title">🛍️ ตกแต่งร้าน</div><div class="page-sub">แบนเนอร์หัวร้าน + แถบโปรโมชัน</div></div>',
'  <div class="card"><div class="card-title">🖼️ แบนเนอร์หัวร้าน</div>',
'    <div class="form-grid">',
'      <div class="fg"><label>เปิดแบนเนอร์</label><label class="toggle"><input type="checkbox" id="shop-banner-on" checked><span class="toggle-slider"></span></label></div>',
'      <div class="fg"><label>ชื่อร้านบนแบนเนอร์</label><input id="shop-banner-title-in" placeholder="DemeterRich"></div>',
'      <div class="fg"><label>คำโปรย</label><input id="shop-banner-tag-in" placeholder="ปุ๋ยเหลวคุณภาพเพื่อชาวสวน"></div>',
'      <div class="fg"><label>รูปปก (URL — เว้นว่าง = ใช้สีไล่เฉด)</label><input id="shop-cover-img" placeholder="https://..."></div>',
'      <div class="fg"><label>สีไล่เฉด 1</label><input type="color" id="shop-cover-c1" value="#1877f2"></div>',
'      <div class="fg"><label>สีไล่เฉด 2</label><input type="color" id="shop-cover-c2" value="#42b883"></div>',
'    </div>',
'  </div>',
'  <div class="card"><div class="card-title">📣 แถบโปรโมชัน</div>',
'    <div class="form-grid">',
'      <div class="fg"><label>เปิดแถบโปรโมชัน</label><label class="toggle"><input type="checkbox" id="shop-promo-on" checked><span class="toggle-slider"></span></label></div>',
'      <div class="fg"><label>ข้อความโปรโมชัน</label><input id="shop-promo-text-in" placeholder="🚚 ส่งฟรีเมื่อซื้อครบ 500 บาท"></div>',
'    </div>',
'  </div>',
'  <div class="save-row">',
'    <button class="btn btn-ghost" onclick="loadShopDecor()">↺ รีเซ็ต</button>',
'    <button class="btn btn-primary" onclick="saveShopDecor()">💾 บันทึก</button>',
'  </div>',
'</div>',
'',
'<!-- PRODUCTS -->'
].join(NL);
adm = replaceOnce(ADM, adm, SEC_OLD, SEC_NEW, 'id="screen-shopdecor"');

// ADM-3: loaders map
const LD_OLD = 'points: loadPoints, products: loadProducts,';
const LD_NEW = 'points: loadPoints, shopdecor: loadShopDecor, products: loadProducts,';
adm = replaceOnce(ADM, adm, LD_OLD, LD_NEW, 'shopdecor: loadShopDecor');

// ADM-4: load/save functions (แทรกก่อน async function loadPoints)
const FNA_OLD = 'async function loadPoints() {';
const FNA_NEW = [
'async function loadShopDecor() {',
'  try {',
"    const doc = await db.collection('settings').doc('shop').get();",
'    const d = doc.exists ? doc.data() : {};',
'    const sv = (id,v)=>{ const e=document.getElementById(id); if(e) e.value=v; };',
'    const sc = (id,v)=>{ const e=document.getElementById(id); if(e) e.checked=v; };',
'    sc("shop-banner-on", d.bannerOn !== false);',
'    sv("shop-banner-title-in", d.bannerTitle || "");',
'    sv("shop-banner-tag-in", d.bannerTagline || "");',
'    sv("shop-cover-img", d.coverImage || "");',
'    if (d.coverColor1) sv("shop-cover-c1", d.coverColor1);',
'    if (d.coverColor2) sv("shop-cover-c2", d.coverColor2);',
'    sc("shop-promo-on", d.promoOn !== false);',
'    sv("shop-promo-text-in", d.promoText || "");',
'  } catch(e) {}',
'}',
'async function saveShopDecor() {',
'  try {',
"    await db.collection('settings').doc('shop').set({",
"      bannerOn: document.getElementById('shop-banner-on').checked,",
"      bannerTitle: document.getElementById('shop-banner-title-in').value,",
"      bannerTagline: document.getElementById('shop-banner-tag-in').value,",
"      coverImage: document.getElementById('shop-cover-img').value.trim(),",
"      coverColor1: document.getElementById('shop-cover-c1').value,",
"      coverColor2: document.getElementById('shop-cover-c2').value,",
"      promoOn: document.getElementById('shop-promo-on').checked,",
"      promoText: document.getElementById('shop-promo-text-in').value,",
'      updatedAt: firebase.firestore.FieldValue.serverTimestamp()',
'    }, { merge: true });',
"    toast('✅ บันทึกแล้ว','success');",
"  } catch(e) { toast('❌ '+e.message,'error'); }",
'}',
'async function loadPoints() {'
].join(NL);
adm = replaceOnce(ADM, adm, FNA_OLD, FNA_NEW, 'async function saveShopDecor() {');

fs.writeFileSync(ADM, adm);

console.log(CHANGED ? '✅ patch #3 เฟส A สำเร็จ' : '✅ ไม่มีอะไรเปลี่ยน (idempotent)');
