#!/usr/bin/env node
/* #1 banner upload (admin) + #2 หน้ารายละเอียดสินค้า (modal) + ฟิลด์ description
 * index.html: map + การ์ดกดเปิด + detail modal + CSS + openProduct
 * admin.html: ปุ่มอัปโหลด banner + uploadShopBanner + description (add form/edit modal)
 * storage.rules: เพิ่ม path shop-banner/ (admin เขียน)
 * idempotent · ต่อจาก A+B+C
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

// P1: map เพิ่ม description/diseases/crops
const MAP_OLD = ['      featured: p.featured === true','    }));'].join(NL);
const MAP_NEW = [
'      featured: p.featured === true,',
"      description: p.description || '',",
'      diseases: Array.isArray(p.diseases) ? p.diseases : [],',
'      crops: Array.isArray(p.crops) ? p.crops : []',
'    }));'
].join(NL);
idx = replaceOnce(IDX, idx, MAP_OLD, MAP_NEW, "description: p.description || ''");

// P2a: prod-card กดเปิดรายละเอียด
idx = replaceOnce(IDX, idx,
  "    return '<div class=\"prod-card\">'+",
  "    return '<div class=\"prod-card\" onclick=\"openProduct(\\''+p.id+'\\')\">'+",
  'prod-card" onclick="openProduct');

// P2b: ปุ่ม + ไม่เปิด detail (stopPropagation)
idx = replaceOnce(IDX, idx,
  "          '<button class=\"prod-add\" onclick=\"addToCart(\\''+p.id+'\\')\">+</button>'+",
  "          '<button class=\"prod-add\" onclick=\"event.stopPropagation();addToCart(\\''+p.id+'\\')\">+</button>'+",
  'event.stopPropagation();addToCart');

// P2c: feat-card กดเปิดรายละเอียด (แทน addToCart)
idx = replaceOnce(IDX, idx,
  "    return '<div class=\"feat-card\" onclick=\"addToCart(\\''+p.id+'\\')\">'+",
  "    return '<div class=\"feat-card\" onclick=\"openProduct(\\''+p.id+'\\')\">'+",
  'feat-card" onclick="openProduct');

// P2d: CSS รายละเอียด (แทรกหลัง .prod-sold)
idx = replaceOnce(IDX, idx,
  '.prod-sold{font-size:11px;color:var(--muted)}',
  ['.prod-sold{font-size:11px;color:var(--muted)}',
   '.pd-img{width:100%;height:230px;background:#f0f2f5;display:flex;align-items:center;justify-content:center;font-size:80px;overflow:hidden}',
   '.pd-img img{width:100%;height:100%;object-fit:cover}',
   '.pd-info{padding:14px 16px}',
   '.pd-name{font-size:18px;font-weight:800;color:var(--text);line-height:1.3}',
   '.pd-pricerow{display:flex;align-items:baseline;gap:8px;margin-top:8px;flex-wrap:wrap}',
   '.pd-price{font-size:22px;font-weight:800;color:var(--shop-price,#ee4d2d)}',
   '.pd-old{font-size:14px;color:var(--muted);text-decoration:line-through}',
   '.pd-disc{background:var(--shop-discbg,#ffde00);color:var(--shop-disc,#ee4d2d);font-size:12px;font-weight:800;padding:2px 7px;border-radius:5px}',
   '.pd-sold{font-size:12px;color:var(--muted);margin-top:5px}',
   '.pd-sec{margin-top:14px}',
   '.pd-sec-h{font-size:13px;font-weight:700;color:var(--text);margin-bottom:6px}',
   '.pd-desc{font-size:14px;color:var(--text);line-height:1.6;white-space:pre-wrap}',
   '.pd-chips{display:flex;flex-wrap:wrap;gap:6px}',
   '.pd-chip{background:#f0f2f5;border-radius:14px;padding:4px 11px;font-size:12px;color:var(--text)}',
   '.pd-add{margin:14px 16px 4px;width:calc(100% - 32px);background:var(--primary);color:#fff;border:none;border-radius:10px;padding:13px;font-size:15px;font-weight:700;cursor:pointer}'].join(NL),
  '.pd-img{width:100%;height:230px');

// P2e: detail modal HTML (แทรกก่อน CART MODAL)
idx = replaceOnce(IDX, idx,
  '<!-- ══ CART MODAL (ตะกร้า) ══ -->',
  ['<!-- ══ PRODUCT DETAIL MODAL ══ -->',
   '<div class="cart-modal" id="prodDetailModal" onclick="if(event.target===this)closeProduct()">',
   '  <div class="cart-sheet">',
   '    <div class="cart-hd"><div class="cart-hd-t">รายละเอียดสินค้า</div><button class="cart-x" onclick="closeProduct()">✕</button></div>',
   '    <div id="pd-body" style="overflow-y:auto"></div>',
   '  </div>',
   '</div>',
   '',
   '<!-- ══ CART MODAL (ตะกร้า) ══ -->'].join(NL),
  'id="prodDetailModal"');

// P2f: openProduct/closeProduct (แทรกก่อน renderFeatured)
idx = replaceOnce(IDX, idx,
  'function renderFeatured(){',
  ['function openProduct(id){',
   '  var p = shopProducts.find(function(x){ return x.id===id; });',
   '  if (!p) return;',
   '  var dp = discPct(p);',
   "  var disc = dp>0 ? '<span class=\"pd-disc\">-'+dp+'%</span>' : '';",
   "  var oldp = (p.oldPrice && p.oldPrice>p.price) ? '<span class=\"pd-old\">'+baht(p.oldPrice)+'</span>' : '';",
   "  var sold = p.soldCount>0 ? '<div class=\"pd-sold\">ขายแล้ว '+p.soldCount+' ชิ้น</div>' : '';",
   "  var desc = p.description ? '<div class=\"pd-sec\"><div class=\"pd-sec-h\">รายละเอียด</div><div class=\"pd-desc\">'+escapeHtml(p.description)+'</div></div>' : '';",
   "  var chip = function(arr){ return arr.map(function(x){ return '<span class=\"pd-chip\">'+escapeHtml(x)+'</span>'; }).join(''); };",
   "  var dis = (p.diseases && p.diseases.length) ? '<div class=\"pd-sec\"><div class=\"pd-sec-h\">ใช้รักษาโรค</div><div class=\"pd-chips\">'+chip(p.diseases)+'</div></div>' : '';",
   "  var crp = (p.crops && p.crops.length) ? '<div class=\"pd-sec\"><div class=\"pd-sec-h\">พืชที่ใช้ได้</div><div class=\"pd-chips\">'+chip(p.crops)+'</div></div>' : '';",
   "  var html = '<div class=\"pd-img\">'+(p.image ? '<img src=\"'+escapeHtml(p.image)+'\" alt=\"\">' : catEmoji(p.category))+'</div>'+",
   "    '<div class=\"pd-info\">'+",
   "      '<div class=\"pd-name\">'+escapeHtml(p.name)+'</div>'+",
   "      '<div class=\"pd-pricerow\"><span class=\"pd-price\">'+(p.price?baht(p.price):'—')+'</span>'+oldp+disc+'</div>'+",
   '      sold+',
   "      '<div class=\"pd-sec\"><div class=\"pd-sec-h\">หมวดหมู่</div><div class=\"pd-chips\"><span class=\"pd-chip\">'+escapeHtml(catName(p.category))+'</span></div></div>'+",
   '      desc + dis + crp +',
   "    '</div>'+",
   "    '<button class=\"pd-add\" onclick=\"addToCart(\\''+p.id+'\\');closeProduct()\">🛒 ใส่ตะกร้า</button>'+",
   "    '<div style=\"height:14px\"></div>';",
   "  var body = document.getElementById('pd-body'); if (body) body.innerHTML = html;",
   "  var m = document.getElementById('prodDetailModal'); if (m) m.classList.add('open');",
   '}',
   "function closeProduct(){ var m = document.getElementById('prodDetailModal'); if (m) m.classList.remove('open'); }",
   'function renderFeatured(){'].join(NL),
  'function openProduct(id){');

fs.writeFileSync(IDX, idx);

/* ===================== admin.html ===================== */
const ADM = 'admin.html';
let adm = read(ADM);

// P1-ADM: ปุ่มอัปโหลด banner (หลังช่อง URL รูปปก)
adm = replaceOnce(ADM, adm,
  '      <div class="fg"><label>รูปปก (URL — เว้นว่าง = ใช้สีไล่เฉด)</label><input id="shop-cover-img" placeholder="https://..."></div>',
  ['      <div class="fg"><label>รูปปก (URL — เว้นว่าง = ใช้สีไล่เฉด)</label><input id="shop-cover-img" placeholder="https://..."></div>',
   '      <div class="fg"><label>หรืออัปโหลดรูปปก</label><input type="file" id="shop-cover-file" accept="image/*" onchange="uploadShopBanner(this)"><div id="shop-cover-prog" style="display:none;font-size:12px;color:var(--muted);margin-top:4px">กำลังอัปโหลด...</div></div>'].join(NL),
  'id="shop-cover-file"');

// P1-ADM: ฟังก์ชัน uploadShopBanner (ก่อน uploadIcon)
adm = replaceOnce(ADM, adm,
  'async function uploadIcon(key, input) {',
  ['async function uploadShopBanner(input){',
   '  const file = input.files[0]; if (!file) return;',
   "  if (file.size > 3*1024*1024) { toast('❌ ไฟล์ใหญ่เกิน 3MB','error'); return; }",
   "  const prog = document.getElementById('shop-cover-prog'); if (prog) prog.style.display='block';",
   '  try {',
   "    const ref = storage.ref('shop-banner/cover_'+Date.now()+'.'+file.name.split('.').pop());",
   '    await ref.put(file);',
   '    const url = await ref.getDownloadURL();',
   "    document.getElementById('shop-cover-img').value = url;",
   "    if (prog) prog.style.display='none';",
   "    toast('✅ อัปโหลดสำเร็จ — กด บันทึก เพื่อใช้','success');",
   "  } catch(e){ if (prog) prog.style.display='none'; toast('❌ '+e.message,'error'); }",
   '}',
   'async function uploadIcon(key, input) {'].join(NL),
  'async function uploadShopBanner(input){');

// P2-ADM: description ในฟอร์มเพิ่มสินค้า
adm = replaceOnce(ADM, adm,
  '      <div class="fg"><label>ป้าย Badge (เช่น ขายดี / ใหม่)</label><input id="new-prod-badge" placeholder="เว้นว่าง = ไม่มีป้าย"></div>',
  ['      <div class="fg"><label>ป้าย Badge (เช่น ขายดี / ใหม่)</label><input id="new-prod-badge" placeholder="เว้นว่าง = ไม่มีป้าย"></div>',
   '      <div class="fg" style="grid-column:1/-1"><label>รายละเอียดสินค้า</label><textarea id="new-prod-desc" rows="3" placeholder="อธิบายสรรพคุณ วิธีใช้ ขนาดบรรจุ ฯลฯ"></textarea></div>'].join(NL),
  'id="new-prod-desc"');

// P2-ADM: addProduct บันทึก description
adm = replaceOnce(ADM, adm,
  "      featured: document.getElementById('new-prod-featured').checked,",
  ["      featured: document.getElementById('new-prod-featured').checked,",
   "      description: document.getElementById('new-prod-desc').value.trim(),"].join(NL),
  "description: document.getElementById('new-prod-desc')");

// P2-ADM: reset description
adm = replaceOnce(ADM, adm,
  "    document.getElementById('new-prod-featured').checked = false;",
  ["    document.getElementById('new-prod-featured').checked = false;",
   "    document.getElementById('new-prod-desc').value = '';"].join(NL),
  "new-prod-desc').value = '';");

// P2-ADM: description ใน edit modal (prodb)
adm = replaceOnce(ADM, adm,
  '      <div class="fg"><label>⭐ สินค้าแนะนำ</label><label class="toggle"><input type="checkbox" id="prodb-featured"><span class="toggle-slider"></span></label></div>',
  ['      <div class="fg"><label>⭐ สินค้าแนะนำ</label><label class="toggle"><input type="checkbox" id="prodb-featured"><span class="toggle-slider"></span></label></div>',
   '      <div class="fg" style="grid-column:1/-1"><label>รายละเอียดสินค้า</label><textarea id="prodb-desc" rows="3"></textarea></div>'].join(NL),
  'id="prodb-desc"');

// P2-ADM: editProductB โหลด description
adm = replaceOnce(ADM, adm,
  "    document.getElementById('prodb-featured').checked = p.featured === true;",
  ["    document.getElementById('prodb-featured').checked = p.featured === true;",
   "    document.getElementById('prodb-desc').value = p.description || '';"].join(NL),
  "prodb-desc').value = p.description");

// P2-ADM: saveProdB บันทึก description
adm = replaceOnce(ADM, adm,
  "      featured: document.getElementById('prodb-featured').checked",
  ["      featured: document.getElementById('prodb-featured').checked,",
   "      description: document.getElementById('prodb-desc').value.trim()"].join(NL),
  "description: document.getElementById('prodb-desc')");

fs.writeFileSync(ADM, adm);

/* ===================== storage.rules ===================== */
const RUL = 'storage.rules';
let rul = read(RUL);
const RUL_OLD = [
'    match /{allPaths=**} {',
'      allow read, write: if false;',
'    }'
].join(NL);
const RUL_NEW = [
'    // แบนเนอร์ร้าน — admin อัพได้ เฉพาะรูป ไม่เกิน 5MB',
'    match /shop-banner/{fileName} {',
'      allow read: if true;',
'      allow write: if isAdmin() && isImage() && underLimit(5);',
'    }',
'',
'    match /{allPaths=**} {',
'      allow read, write: if false;',
'    }'
].join(NL);
rul = replaceOnce(RUL, rul, RUL_OLD, RUL_NEW, 'match /shop-banner/{fileName} {');
fs.writeFileSync(RUL, rul);

console.log(CHANGED ? '✅ patch #1+#2 สำเร็จ' : '✅ ไม่มีอะไรเปลี่ยน (idempotent)');
