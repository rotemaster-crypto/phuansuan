#!/usr/bin/env node
/* #3 เฟส B — การ์ดสไตล์ Shopee (ป้ายลด%/ราคาเดิม/ยอดขาย/badge) + carousel สินค้าแนะนำ
 * index.html: CSS + carousel HTML + loadShop map + renderProducts + renderFeatured
 * admin.html: ฟิลด์โปรในฟอร์มเพิ่มสินค้า + addProduct + edit modal (ตั้งโปรสินค้าเดิม)
 * idempotent · ไม่แตะ rules
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

// B1: CSS (แทรกหลัง .prod-price)
const B1_OLD = '.prod-price{font-size:15px;font-weight:800;color:var(--primary)}';
const B1_NEW = [
'.prod-price{font-size:15px;font-weight:800;color:var(--primary)}',
'.prod-img{position:relative}',
'.disc-badge{position:absolute;top:0;right:0;background:#ffde00;color:#ee4d2d;font-size:11px;font-weight:800;line-height:1.1;padding:3px 4px;text-align:center;z-index:2}',
'.prod-badge{position:absolute;top:0;left:0;background:#ee4d2d;color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-bottom-right-radius:8px;z-index:2}',
'.prod-pricewrap{display:flex;align-items:baseline;gap:5px;flex-wrap:wrap}',
'.prod-oldprice{font-size:11px;color:var(--muted);text-decoration:line-through}',
'.prod-sold{font-size:11px;color:var(--muted)}',
'.feat-wrap{background:#fff;padding:12px 0 6px;border-bottom:8px solid var(--bg)}',
'.feat-hd{display:flex;align-items:center;gap:6px;font-size:15px;font-weight:800;color:var(--text);padding:0 12px 9px}',
'.feat-row{display:flex;gap:10px;overflow-x:auto;padding:0 12px 6px;scrollbar-width:none}',
'.feat-row::-webkit-scrollbar{display:none}',
'.feat-card{flex:0 0 134px;background:#fff;border:1px solid var(--border);border-radius:12px;overflow:hidden;position:relative;cursor:pointer}',
'.feat-card .fc-img{position:relative;height:100px;background:#f0f2f5;display:flex;align-items:center;justify-content:center;font-size:40px;overflow:hidden}',
'.feat-card .fc-img img{width:100%;height:100%;object-fit:cover}',
'.feat-card .fc-body{padding:7px 9px}',
'.feat-card .fc-name{font-size:12px;font-weight:600;color:var(--text);line-height:1.3;height:31px;overflow:hidden}',
'.feat-card .fc-price{font-size:14px;font-weight:800;color:#ee4d2d;margin-top:3px}'
].join(NL);
idx = replaceOnce(IDX, idx, B1_OLD, B1_NEW, '.feat-card .fc-price{');

// B2: carousel HTML (แทรกก่อน prod-grid)
const B2_OLD = '  <div class="prod-grid" id="prod-grid">';
const B2_NEW = [
'  <div id="feat-wrap" class="feat-wrap" style="display:none"><div class="feat-hd">🔥 สินค้าแนะนำ</div><div class="feat-row" id="feat-row"></div></div>',
'  <div class="prod-grid" id="prod-grid">'
].join(NL);
idx = replaceOnce(IDX, idx, B2_OLD, B2_NEW, 'id="feat-wrap"');

// B3: loadShop map — เพิ่ม field โปรโมชัน (anchor 2 บรรทัดกัน substring ชน)
const B3_OLD = [
'      weightKg: Number(p.weightKg) || commerceCfg().defaultWeightKg',
'    }));'
].join(NL);
const B3_NEW = [
'      weightKg: Number(p.weightKg) || commerceCfg().defaultWeightKg,',
'      oldPrice: parsePrice(p.oldPrice),',
'      discountPct: Number(p.discountPct) || 0,',
'      soldCount: Number(p.soldCount) || 0,',
'      badge: p.badge || "",',
'      featured: p.featured === true',
'    }));'
].join(NL);
idx = replaceOnce(IDX, idx, B3_OLD, B3_NEW, 'featured: p.featured === true');

// B4: เรียก renderFeatured ใน loadShop
const B4_OLD = ['    renderCats();','    renderProducts();'].join(NL);
const B4_NEW = ['    renderCats();','    renderProducts();','    renderFeatured();'].join(NL);
idx = replaceOnce(IDX, idx, B4_OLD, B4_NEW, '    renderFeatured();');

// B5: แทน renderProducts ทั้งฟังก์ชัน + เพิ่ม discPct/renderFeatured
const B5_OLD = [
'function renderProducts(){',
'  const grid = document.getElementById(\'prod-grid\');',
'  if (!grid) return;',
'  const list = shopProducts.filter(p => activeCat===\'all\' || p.category===activeCat);',
'  if (!list.length){ grid.innerHTML = \'<div class="shop-empty">ยังไม่มีสินค้าในหมวดนี้</div>\'; return; }',
'  grid.innerHTML = list.map(p =>',
'    \'<div class="prod-card">\'+',
'      \'<div class="prod-img">\'+(p.image ? \'<img src="\'+escapeHtml(p.image)+\'" alt="">\' : catEmoji(p.category))+\'</div>\'+',
'      \'<div class="prod-body">\'+',
'        \'<div class="prod-name">\'+escapeHtml(p.name)+\'</div>\'+',
'        \'<div class="prod-cat">\'+escapeHtml(catName(p.category))+\'</div>\'+',
'        \'<div class="prod-foot">\'+',
'          \'<span class="prod-price">\'+(p.price ? baht(p.price) : \'—\')+\'</span>\'+',
'          \'<button class="prod-add" onclick="addToCart(\\\'\'+p.id+\'\\\')">+</button>\'+',
'        \'</div>\'+',
'      \'</div>\'+',
'    \'</div>\'',
'  ).join(\'\');',
'}'
].join(NL);
const B5_NEW = [
'function discPct(p){',
'  if (p.discountPct > 0) return Math.round(p.discountPct);',
'  if (p.oldPrice && p.price && p.oldPrice > p.price) return Math.round((1 - p.price / p.oldPrice) * 100);',
'  return 0;',
'}',
'function renderProducts(){',
'  const grid = document.getElementById(\'prod-grid\');',
'  if (!grid) return;',
'  const list = shopProducts.filter(p => activeCat===\'all\' || p.category===activeCat);',
'  if (!list.length){ grid.innerHTML = \'<div class="shop-empty">ยังไม่มีสินค้าในหมวดนี้</div>\'; return; }',
'  grid.innerHTML = list.map(function(p){',
'    var dp = discPct(p);',
'    var badge = p.badge ? \'<div class="prod-badge">\'+escapeHtml(p.badge)+\'</div>\' : \'\';',
'    var disc = dp>0 ? \'<div class="disc-badge">-\'+dp+\'%</div>\' : \'\';',
'    var oldp = (p.oldPrice && p.oldPrice>p.price) ? \'<span class="prod-oldprice">\'+baht(p.oldPrice)+\'</span>\' : \'\';',
'    var sold = p.soldCount>0 ? \'<div class="prod-sold">ขายแล้ว \'+p.soldCount+\'</div>\' : \'\';',
'    return \'<div class="prod-card">\'+',
'      \'<div class="prod-img">\'+badge+disc+(p.image ? \'<img src="\'+escapeHtml(p.image)+\'" alt="">\' : catEmoji(p.category))+\'</div>\'+',
'      \'<div class="prod-body">\'+',
'        \'<div class="prod-name">\'+escapeHtml(p.name)+\'</div>\'+',
'        \'<div class="prod-cat">\'+escapeHtml(catName(p.category))+\'</div>\'+',
'        sold+',
'        \'<div class="prod-foot">\'+',
'          \'<div class="prod-pricewrap">\'+oldp+\'<span class="prod-price">\'+(p.price ? baht(p.price) : \'—\')+\'</span></div>\'+',
'          \'<button class="prod-add" onclick="addToCart(\\\'\'+p.id+\'\\\')">+</button>\'+',
'        \'</div>\'+',
'      \'</div>\'+',
'    \'</div>\';',
'  }).join(\'\');',
'}',
'function renderFeatured(){',
'  var wrap = document.getElementById(\'feat-wrap\'), row = document.getElementById(\'feat-row\');',
'  if (!wrap || !row) return;',
'  var list = shopProducts.filter(function(p){ return p.featured; });',
'  if (!list.length){ wrap.style.display = \'none\'; return; }',
'  wrap.style.display = \'\';',
'  row.innerHTML = list.map(function(p){',
'    var dp = discPct(p);',
'    var disc = dp>0 ? \'<div class="disc-badge">-\'+dp+\'%</div>\' : \'\';',
'    return \'<div class="feat-card" onclick="addToCart(\\\'\'+p.id+\'\\\')">\'+',
'      \'<div class="fc-img">\'+disc+(p.image ? \'<img src="\'+escapeHtml(p.image)+\'" alt="">\' : catEmoji(p.category))+\'</div>\'+',
'      \'<div class="fc-body"><div class="fc-name">\'+escapeHtml(p.name)+\'</div><div class="fc-price">\'+(p.price?baht(p.price):\'—\')+\'</div></div>\'+',
'    \'</div>\';',
'  }).join(\'\');',
'}'
].join(NL);
idx = replaceOnce(IDX, idx, B5_OLD, B5_NEW, 'function renderFeatured(){');

fs.writeFileSync(IDX, idx);

/* ===================== admin.html ===================== */
const ADM = 'admin.html';
let adm = read(ADM);

// BA1: ฟิลด์โปรในฟอร์มเพิ่มสินค้า
const BA1_OLD = '      <div class="fg"><label>พืชที่ใช้ได้ (คั่นด้วยจุลภาค)</label><input id="new-prod-crops" placeholder="เช่น mango, chili"></div>';
const BA1_NEW = [
'      <div class="fg"><label>พืชที่ใช้ได้ (คั่นด้วยจุลภาค)</label><input id="new-prod-crops" placeholder="เช่น mango, chili"></div>',
'      <div class="fg"><label>ราคาเดิม (ก่อนลด — เว้นว่างได้)</label><input id="new-prod-oldprice" placeholder="เช่น 220 บาท"></div>',
'      <div class="fg"><label>ยอดขาย (จำนวนที่ขายแล้ว)</label><input type="number" id="new-prod-sold" placeholder="0"></div>',
'      <div class="fg"><label>ป้าย Badge (เช่น ขายดี / ใหม่)</label><input id="new-prod-badge" placeholder="เว้นว่าง = ไม่มีป้าย"></div>',
'      <div class="fg"><label>⭐ สินค้าแนะนำ (โชว์ใน carousel)</label><label class="toggle"><input type="checkbox" id="new-prod-featured"><span class="toggle-slider"></span></label></div>'
].join(NL);
adm = replaceOnce(ADM, adm, BA1_OLD, BA1_NEW, 'id="new-prod-oldprice"');

// BA2: addProduct บันทึกฟิลด์โปร
const BA2_OLD = "      crops: document.getElementById('new-prod-crops').value.split(',').map(s=>s.trim()).filter(Boolean),";
const BA2_NEW = [
"      crops: document.getElementById('new-prod-crops').value.split(',').map(s=>s.trim()).filter(Boolean),",
"      oldPrice: document.getElementById('new-prod-oldprice').value,",
"      soldCount: +document.getElementById('new-prod-sold').value || 0,",
"      badge: document.getElementById('new-prod-badge').value.trim(),",
"      featured: document.getElementById('new-prod-featured').checked,"
].join(NL);
adm = replaceOnce(ADM, adm, BA2_OLD, BA2_NEW, "oldPrice: document.getElementById('new-prod-oldprice')");

// BA3: reset ฟอร์มหลังเพิ่ม
const BA3_OLD = "    document.getElementById('new-prod-price').value = '';";
const BA3_NEW = [
"    document.getElementById('new-prod-price').value = '';",
"    document.getElementById('new-prod-oldprice').value = '';",
"    document.getElementById('new-prod-sold').value = '';",
"    document.getElementById('new-prod-badge').value = '';",
"    document.getElementById('new-prod-featured').checked = false;"
].join(NL);
adm = replaceOnce(ADM, adm, BA3_OLD, BA3_NEW, "new-prod-oldprice').value = '';");

// BA4: ตารางสินค้า — เพิ่มปุ่มแก้ + ดาวแนะนำ
const BA4_OLD = [
'          return `<tr><td style="font-weight:700">${p.name}</td><td><span class="tag-chip">${p.category||\'—\'}</span></td><td>${p.price||\'—\'}</td>',
'          <td><button class="btn btn-danger" style="padding:5px 10px;font-size:12px" onclick="deleteProduct(\'${doc.id}\')">🗑️ ลบ</button></td></tr>`;'
].join(NL);
const BA4_NEW = [
'          return `<tr><td style="font-weight:700">${p.featured?\'⭐ \':\'\'}${p.name}</td><td><span class="tag-chip">${p.category||\'—\'}</span></td><td>${p.price||\'—\'}</td>',
'          <td><button class="btn btn-ghost" style="padding:5px 10px;font-size:12px" onclick="editProductB(\'${doc.id}\')">✏️ แก้</button> <button class="btn btn-danger" style="padding:5px 10px;font-size:12px" onclick="deleteProduct(\'${doc.id}\')">🗑️ ลบ</button></td></tr>`;'
].join(NL);
adm = replaceOnce(ADM, adm, BA4_OLD, BA4_NEW, 'editProductB(\'${doc.id}\')');

// BA5: edit modal HTML (แทรกก่อน screen-orders)
const BA5_OLD = '<div class="screen" id="screen-orders">';
const BA5_NEW = [
'<div id="prodb-modal" style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:none;align-items:center;justify-content:center" onclick="if(event.target===this)closeProdB()">',
'  <div style="background:#fff;border-radius:14px;max-width:420px;width:92%;max-height:86vh;overflow:auto;padding:18px">',
'    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><div style="font-size:17px;font-weight:800">✏️ ตั้งโปรโมชันสินค้า</div><div onclick="closeProdB()" style="cursor:pointer;font-size:20px;color:#888">✕</div></div>',
'    <div id="prodb-name" style="font-weight:700;margin-bottom:10px;color:var(--primary)"></div>',
'    <div class="form-grid">',
'      <div class="fg"><label>ราคา</label><input id="prodb-price"></div>',
'      <div class="fg"><label>ราคาเดิม (ก่อนลด)</label><input id="prodb-oldprice"></div>',
'      <div class="fg"><label>ยอดขาย</label><input type="number" id="prodb-sold"></div>',
'      <div class="fg"><label>ป้าย Badge</label><input id="prodb-badge"></div>',
'      <div class="fg"><label>⭐ สินค้าแนะนำ</label><label class="toggle"><input type="checkbox" id="prodb-featured"><span class="toggle-slider"></span></label></div>',
'    </div>',
'    <div class="save-row"><button class="btn btn-ghost" onclick="closeProdB()">ยกเลิก</button><button class="btn btn-primary" onclick="saveProdB()">💾 บันทึก</button></div>',
'  </div>',
'</div>',
'',
'<div class="screen" id="screen-orders">'
].join(NL);
adm = replaceOnce(ADM, adm, BA5_OLD, BA5_NEW, 'id="prodb-modal"');

// BA6: edit modal JS (แทรกก่อน loadProducts)
const BA6_OLD = 'async function loadProducts() {';
const BA6_NEW = [
'let _prodbId = null;',
'async function editProductB(id){',
'  try {',
"    const doc = await db.collection('products').doc(id).get();",
'    if (!doc.exists) return;',
'    const p = doc.data(); _prodbId = id;',
"    document.getElementById('prodb-name').textContent = p.name || '';",
"    document.getElementById('prodb-price').value = p.price || '';",
"    document.getElementById('prodb-oldprice').value = p.oldPrice || '';",
"    document.getElementById('prodb-sold').value = p.soldCount || 0;",
"    document.getElementById('prodb-badge').value = p.badge || '';",
"    document.getElementById('prodb-featured').checked = p.featured === true;",
"    document.getElementById('prodb-modal').style.display = 'flex';",
"  } catch(e){ toast('❌ '+e.message,'error'); }",
'}',
"function closeProdB(){ document.getElementById('prodb-modal').style.display='none'; _prodbId=null; }",
'async function saveProdB(){',
'  if (!_prodbId) return;',
'  try {',
"    await db.collection('products').doc(_prodbId).update({",
"      price: document.getElementById('prodb-price').value,",
"      oldPrice: document.getElementById('prodb-oldprice').value,",
"      soldCount: +document.getElementById('prodb-sold').value || 0,",
"      badge: document.getElementById('prodb-badge').value.trim(),",
"      featured: document.getElementById('prodb-featured').checked",
'    });',
"    toast('✅ บันทึกแล้ว','success'); closeProdB(); loadProducts();",
"  } catch(e){ toast('❌ '+e.message,'error'); }",
'}',
'async function loadProducts() {'
].join(NL);
adm = replaceOnce(ADM, adm, BA6_OLD, BA6_NEW, 'async function saveProdB(){');

fs.writeFileSync(ADM, adm);

console.log(CHANGED ? '✅ patch #3 เฟส B สำเร็จ' : '✅ ไม่มีอะไรเปลี่ยน (idempotent)');
