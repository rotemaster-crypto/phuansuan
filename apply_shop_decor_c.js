#!/usr/bin/env node
/* #3 เฟส C — ปรับได้ทุกส่วน: สี/ขนาด/ข้อความ/เปิดปิด ทุกชิ้นในหน้าร้าน (settings/shop)
 * index.html: CSS vars + applyShop ขยาย + renderFeatured/renderProducts/loadShop
 * admin.html: ขยายฟอร์มตกแต่งร้าน + load/save ครบ
 * idempotent · ไม่แตะ rules · ต่อยอดจาก A+B
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

// C-CSS: เปลี่ยนสี/ขนาด เป็น CSS vars
idx = replaceOnce(IDX, idx,
  '.disc-badge{position:absolute;top:0;right:0;background:#ffde00;color:#ee4d2d;font-size:11px;font-weight:800;line-height:1.1;padding:3px 4px;text-align:center;z-index:2}',
  '.disc-badge{position:absolute;top:0;right:0;background:var(--shop-discbg,#ffde00);color:var(--shop-disc,#ee4d2d);font-size:11px;font-weight:800;line-height:1.1;padding:3px 4px;text-align:center;z-index:2}',
  'background:var(--shop-discbg,#ffde00)');
idx = replaceOnce(IDX, idx,
  '.prod-badge{position:absolute;top:0;left:0;background:#ee4d2d;color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-bottom-right-radius:8px;z-index:2}',
  '.prod-badge{position:absolute;top:0;left:0;background:var(--shop-disc,#ee4d2d);color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-bottom-right-radius:8px;z-index:2}',
  '.prod-badge{position:absolute;top:0;left:0;background:var(--shop-disc');
idx = replaceOnce(IDX, idx,
  '.prod-price{font-size:15px;font-weight:800;color:var(--primary)}',
  '.prod-price{font-size:15px;font-weight:800;color:var(--shop-price,var(--primary))}',
  'color:var(--shop-price,var(--primary))');
idx = replaceOnce(IDX, idx,
  '.feat-card{flex:0 0 134px;background:#fff;border:1px solid var(--border);border-radius:12px;overflow:hidden;position:relative;cursor:pointer}',
  '.feat-card{flex:0 0 var(--feat-w,134px);background:#fff;border:1px solid var(--border);border-radius:12px;overflow:hidden;position:relative;cursor:pointer}',
  'flex:0 0 var(--feat-w,134px)');
idx = replaceOnce(IDX, idx,
  '.feat-card .fc-price{font-size:14px;font-weight:800;color:#ee4d2d;margin-top:3px}',
  '.feat-card .fc-price{font-size:14px;font-weight:800;color:var(--shop-price,#ee4d2d);margin-top:3px}',
  'color:var(--shop-price,#ee4d2d)');

// C-applyShop: แทนทั้งฟังก์ชัน
const APPLY_OLD = [
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
'}'
].join(NL);
const APPLY_NEW = [
'function applyShop(d) {',
'  d = d || {};',
'  APP_CONFIG.shopDecor = d;',
'  var R = document.documentElement.style;',
'  // การ์ดสินค้า (CSS vars)',
'  R.setProperty("--shop-disc", d.discColor || "#ee4d2d");',
'  R.setProperty("--shop-discbg", d.discBg || "#ffde00");',
'  if (d.priceColorOn && d.priceColor) R.setProperty("--shop-price", d.priceColor); else R.removeProperty("--shop-price");',
'  R.setProperty("--feat-w", (d.featCardWidth ? d.featCardWidth : 134) + "px");',
'  // หัวข้อร้าน + แถบหมวดหมู่',
'  var st = document.querySelector("#screen-shop .shop-title"); if (st) st.textContent = d.shopTitle || "🛒 ร้านค้า";',
'  var cb = document.getElementById("cat-bar"); if (cb) cb.style.display = (d.catBarOn === false) ? "none" : "";',
'  // แบนเนอร์',
'  var bn = document.getElementById("shop-banner");',
'  if (bn) {',
'    var on = d.bannerOn !== false;',
'    bn.style.display = on ? "flex" : "none";',
'    if (on) {',
'      var title = d.bannerTitle || (APP_CONFIG.shop && APP_CONFIG.shop.name) || "🛒 ร้านค้า";',
'      var tag = d.bannerTagline || "";',
'      bn.style.color = d.bannerTextColor || "#fff";',
'      bn.style.minHeight = (d.bannerHeight ? d.bannerHeight : 118) + "px";',
'      var t1 = document.getElementById("shop-banner-title");',
'      if (t1) { t1.textContent = title; t1.style.fontSize = (d.bannerTitleSize ? d.bannerTitleSize : 21) + "px"; }',
'      var t2 = document.getElementById("shop-banner-tag"); if (t2) { t2.textContent = tag; t2.style.display = tag ? "" : "none"; }',
'      if (d.coverImage) { bn.style.backgroundImage = "url(\\"" + d.coverImage + "\\")"; bn.style.backgroundSize = "cover"; bn.style.backgroundPosition = "center"; }',
'      else { var c1 = d.coverColor1 || "var(--primary,#1877f2)"; var c2 = d.coverColor2 || "#42b883"; bn.style.backgroundImage = "none"; bn.style.background = "linear-gradient(135deg," + c1 + "," + c2 + ")"; }',
'    }',
'  }',
'  // แถบโปรโมชัน',
'  var pr = document.getElementById("shop-promo");',
'  if (pr) {',
'    var pon = d.promoOn !== false && !!d.promoText;',
'    pr.style.display = pon ? "flex" : "none";',
'    if (pon) {',
'      pr.style.background = d.promoBg || "#fff7e6";',
'      pr.style.color = d.promoTextColor || "#a15c00";',
'      var pt = document.getElementById("shop-promo-txt"); if (pt) pt.textContent = d.promoText;',
'      var pi = pr.querySelector(".pp-ico"); if (pi) pi.textContent = d.promoIcon || "📣";',
'    }',
'  }',
'  // re-render ถ้าโหลดร้านแล้ว',
'  try { if (typeof shopLoaded !== "undefined" && shopLoaded) { renderFeatured(); renderProducts(); } } catch (e) {}',
'}'
].join(NL);
idx = replaceOnce(IDX, idx, APPLY_OLD, APPLY_NEW, 'R.setProperty("--shop-disc"');

// C-renderFeatured: เพิ่ม featuredOn + custom title
const RF_OLD = [
"  var wrap = document.getElementById('feat-wrap'), row = document.getElementById('feat-row');",
'  if (!wrap || !row) return;',
'  var list = shopProducts.filter(function(p){ return p.featured; });',
"  if (!list.length){ wrap.style.display = 'none'; return; }"
].join(NL);
const RF_NEW = [
"  var wrap = document.getElementById('feat-wrap'), row = document.getElementById('feat-row');",
'  if (!wrap || !row) return;',
'  var dec = APP_CONFIG.shopDecor || {};',
"  var hd = wrap.querySelector('.feat-hd'); if (hd) hd.textContent = dec.featuredTitle || '🔥 สินค้าแนะนำ';",
"  if (dec.featuredOn === false){ wrap.style.display = 'none'; return; }",
'  var list = shopProducts.filter(function(p){ return p.featured; });',
"  if (!list.length){ wrap.style.display = 'none'; return; }"
].join(NL);
idx = replaceOnce(IDX, idx, RF_OLD, RF_NEW, 'var dec = APP_CONFIG.shopDecor || {};');

// C-sold: respect showSold
idx = replaceOnce(IDX, idx,
  '    var sold = p.soldCount>0 ? \'<div class="prod-sold">ขายแล้ว \'+p.soldCount+\'</div>\' : \'\';',
  '    var sold = (p.soldCount>0 && (APP_CONFIG.shopDecor||{}).showSold !== false) ? \'<div class="prod-sold">ขายแล้ว \'+p.soldCount+\'</div>\' : \'\';',
  '(APP_CONFIG.shopDecor||{}).showSold');

// C-loadShop sub: respect custom shopSub
idx = replaceOnce(IDX, idx,
  "  if (sub && APP_CONFIG.shop && APP_CONFIG.shop.name) sub.textContent = 'สินค้าจาก ' + APP_CONFIG.shop.name;",
  ["  var _dec = APP_CONFIG.shopDecor || {};",
   "  if (sub) sub.textContent = _dec.shopSub || ((APP_CONFIG.shop && APP_CONFIG.shop.name) ? 'สินค้าจาก ' + APP_CONFIG.shop.name : 'สินค้าจากร้าน');"].join(NL),
  '_dec.shopSub');

fs.writeFileSync(IDX, idx);

/* ===================== admin.html ===================== */
const ADM = 'admin.html';
let adm = read(ADM);

// CA-page-sub
adm = replaceOnce(ADM, adm,
  '<div class="page-title">🛍️ ตกแต่งร้าน</div><div class="page-sub">แบนเนอร์หัวร้าน + แถบโปรโมชัน</div>',
  '<div class="page-title">🛍️ ตกแต่งร้าน</div><div class="page-sub">ปรับแต่งหน้าร้านทุกส่วน</div>',
  'ปรับแต่งหน้าร้านทุกส่วน');

// CA-banner: เพิ่มฟิลด์
adm = replaceOnce(ADM, adm,
  '      <div class="fg"><label>สีไล่เฉด 2</label><input type="color" id="shop-cover-c2" value="#42b883"></div>',
  ['      <div class="fg"><label>สีไล่เฉด 2</label><input type="color" id="shop-cover-c2" value="#42b883"></div>',
   '      <div class="fg"><label>สีตัวอักษรบนแบนเนอร์</label><input type="color" id="shop-banner-textcolor" value="#ffffff"></div>',
   '      <div class="fg"><label>ความสูงแบนเนอร์ (px)</label><input type="number" id="shop-banner-height" value="118"></div>',
   '      <div class="fg"><label>ขนาดชื่อร้าน (px)</label><input type="number" id="shop-banner-titlesize" value="21"></div>'].join(NL),
  'id="shop-banner-textcolor"');

// CA-promo: เพิ่มฟิลด์
adm = replaceOnce(ADM, adm,
  '      <div class="fg"><label>ข้อความโปรโมชัน</label><input id="shop-promo-text-in" placeholder="🚚 ส่งฟรีเมื่อซื้อครบ 500 บาท"></div>',
  ['      <div class="fg"><label>ข้อความโปรโมชัน</label><input id="shop-promo-text-in" placeholder="🚚 ส่งฟรีเมื่อซื้อครบ 500 บาท"></div>',
   '      <div class="fg"><label>ไอคอนหน้าข้อความ</label><input id="shop-promo-icon" placeholder="📣" maxlength="4"></div>',
   '      <div class="fg"><label>สีพื้นแถบโปรโมชัน</label><input type="color" id="shop-promo-bg" value="#fff7e6"></div>',
   '      <div class="fg"><label>สีตัวอักษรโปรโมชัน</label><input type="color" id="shop-promo-textcolor" value="#a15c00"></div>'].join(NL),
  'id="shop-promo-icon"');

// CA-newcards: เพิ่ม 3 การ์ด ก่อน save-row
const SAVEROW = [
'  <div class="save-row">',
'    <button class="btn btn-ghost" onclick="loadShopDecor()">↺ รีเซ็ต</button>',
'    <button class="btn btn-primary" onclick="saveShopDecor()">💾 บันทึก</button>',
'  </div>'
].join(NL);
const NEWCARDS = [
'  <div class="card"><div class="card-title">🔥 สินค้าแนะนำ (carousel)</div>',
'    <div class="form-grid">',
'      <div class="fg"><label>เปิดแถบสินค้าแนะนำ</label><label class="toggle"><input type="checkbox" id="shop-feat-on" checked><span class="toggle-slider"></span></label></div>',
'      <div class="fg"><label>หัวข้อแถบ</label><input id="shop-feat-title" placeholder="🔥 สินค้าแนะนำ"></div>',
'      <div class="fg"><label>ความกว้างการ์ด (px)</label><input type="number" id="shop-feat-width" value="134"></div>',
'    </div>',
'  </div>',
'  <div class="card"><div class="card-title">🏷️ การ์ดสินค้า</div>',
'    <div class="form-grid">',
'      <div class="fg"><label>สีตัวเลขป้ายลด %</label><input type="color" id="shop-disc-color" value="#ee4d2d"></div>',
'      <div class="fg"><label>สีพื้นป้ายลด %</label><input type="color" id="shop-disc-bg" value="#ffde00"></div>',
'      <div class="fg"><label>ใช้สีราคาเอง (ปิด = ใช้สีแบรนด์)</label><label class="toggle"><input type="checkbox" id="shop-price-on"><span class="toggle-slider"></span></label></div>',
'      <div class="fg"><label>สีราคา</label><input type="color" id="shop-price-color" value="#ee4d2d"></div>',
'      <div class="fg"><label>แสดง "ขายแล้ว N"</label><label class="toggle"><input type="checkbox" id="shop-show-sold" checked><span class="toggle-slider"></span></label></div>',
'    </div>',
'  </div>',
'  <div class="card"><div class="card-title">📋 หัวข้อร้าน & หมวดหมู่</div>',
'    <div class="form-grid">',
'      <div class="fg"><label>ชื่อหัวข้อร้าน</label><input id="shop-title-in" placeholder="🛒 ร้านค้า"></div>',
'      <div class="fg"><label>คำโปรยใต้หัวข้อ (เว้นว่าง = สินค้าจาก[ชื่อร้าน])</label><input id="shop-sub-in" placeholder="สินค้าจากร้าน"></div>',
'      <div class="fg"><label>แสดงแถบหมวดหมู่</label><label class="toggle"><input type="checkbox" id="shop-catbar-on" checked><span class="toggle-slider"></span></label></div>',
'    </div>',
'  </div>'
].join(NL);
adm = replaceOnce(ADM, adm, SAVEROW, NEWCARDS + NL + SAVEROW, 'id="shop-feat-on"');

// CA-load: แทน loadShopDecor
const LOAD_OLD = [
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
'}'
].join(NL);
const LOAD_NEW = [
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
'    sv("shop-banner-textcolor", d.bannerTextColor || "#ffffff");',
'    sv("shop-banner-height", d.bannerHeight || 118);',
'    sv("shop-banner-titlesize", d.bannerTitleSize || 21);',
'    sc("shop-promo-on", d.promoOn !== false);',
'    sv("shop-promo-text-in", d.promoText || "");',
'    sv("shop-promo-icon", d.promoIcon || "");',
'    sv("shop-promo-bg", d.promoBg || "#fff7e6");',
'    sv("shop-promo-textcolor", d.promoTextColor || "#a15c00");',
'    sc("shop-feat-on", d.featuredOn !== false);',
'    sv("shop-feat-title", d.featuredTitle || "");',
'    sv("shop-feat-width", d.featCardWidth || 134);',
'    sv("shop-disc-color", d.discColor || "#ee4d2d");',
'    sv("shop-disc-bg", d.discBg || "#ffde00");',
'    sc("shop-price-on", d.priceColorOn === true);',
'    sv("shop-price-color", d.priceColor || "#ee4d2d");',
'    sc("shop-show-sold", d.showSold !== false);',
'    sv("shop-title-in", d.shopTitle || "");',
'    sv("shop-sub-in", d.shopSub || "");',
'    sc("shop-catbar-on", d.catBarOn !== false);',
'  } catch(e) {}',
'}'
].join(NL);
adm = replaceOnce(ADM, adm, LOAD_OLD, LOAD_NEW, 'shop-banner-textcolor", d.bannerTextColor');

// CA-save: แทน saveShopDecor
const SAVE_OLD = [
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
'}'
].join(NL);
const SAVE_NEW = [
'async function saveShopDecor() {',
'  try {',
'    const gv = id => document.getElementById(id).value;',
'    const gc = id => document.getElementById(id).checked;',
'    const gn = (id,fb) => (+document.getElementById(id).value || fb);',
"    await db.collection('settings').doc('shop').set({",
"      bannerOn: gc('shop-banner-on'),",
"      bannerTitle: gv('shop-banner-title-in'),",
"      bannerTagline: gv('shop-banner-tag-in'),",
"      coverImage: gv('shop-cover-img').trim(),",
"      coverColor1: gv('shop-cover-c1'),",
"      coverColor2: gv('shop-cover-c2'),",
"      bannerTextColor: gv('shop-banner-textcolor'),",
"      bannerHeight: gn('shop-banner-height', 118),",
"      bannerTitleSize: gn('shop-banner-titlesize', 21),",
"      promoOn: gc('shop-promo-on'),",
"      promoText: gv('shop-promo-text-in'),",
"      promoIcon: gv('shop-promo-icon').trim(),",
"      promoBg: gv('shop-promo-bg'),",
"      promoTextColor: gv('shop-promo-textcolor'),",
"      featuredOn: gc('shop-feat-on'),",
"      featuredTitle: gv('shop-feat-title'),",
"      featCardWidth: gn('shop-feat-width', 134),",
"      discColor: gv('shop-disc-color'),",
"      discBg: gv('shop-disc-bg'),",
"      priceColorOn: gc('shop-price-on'),",
"      priceColor: gv('shop-price-color'),",
"      showSold: gc('shop-show-sold'),",
"      shopTitle: gv('shop-title-in'),",
"      shopSub: gv('shop-sub-in'),",
"      catBarOn: gc('shop-catbar-on'),",
'      updatedAt: firebase.firestore.FieldValue.serverTimestamp()',
'    }, { merge: true });',
"    toast('✅ บันทึกแล้ว','success');",
"  } catch(e) { toast('❌ '+e.message,'error'); }",
'}'
].join(NL);
adm = replaceOnce(ADM, adm, SAVE_OLD, SAVE_NEW, "bannerTextColor: gv('shop-banner-textcolor')");

fs.writeFileSync(ADM, adm);

console.log(CHANGED ? '✅ patch #3 เฟส C สำเร็จ' : '✅ ไม่มีอะไรเปลี่ยน (idempotent)');
