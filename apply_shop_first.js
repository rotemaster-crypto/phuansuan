// ============================================================
//  apply_shop_first.js — เพื่อนสวน
//   #1 splash ตามแบรนด์ (cache ลง localStorage → โชว์แบรนด์ทันทีตอนโหลด)
//   #2 ร้านค้าเป็นหน้าแรก (default active = shop + โหลดสินค้าตอนเปิดแอป)
//  index.html ล้วน, idempotent
// ============================================================
const fs = require('fs');
const IH = 'index.html';
if(!fs.existsSync(IH)){ console.error('✗ ไม่พบ '+IH); process.exit(1); }
let s = fs.readFileSync(IH,'utf8');
const cnt=(str,sub)=>str.split(sub).length-1;
const NL = String.fromCharCode(10);

const SPLASH_SCRIPT = `<script>try{var _b=JSON.parse(localStorage.getItem('phuan_brand')||'{}');if(_b.appName){var e1=document.querySelector('.ls-name');if(e1)e1.textContent=_b.appName;}if(_b.logoEmoji){var e2=document.querySelector('.ls-logo');if(e2)e2.textContent=_b.logoEmoji;}if(_b.subtitle){var e3=document.querySelector('.ls-sub');if(e3)e3.textContent=_b.subtitle;}if(_b.primaryColor){document.documentElement.style.setProperty('--primary',_b.primaryColor);}}catch(e){}</script>`;

const edits = [
  { name:'#2 feed ไม่ active', done:'<div class="screen" id="screen-feed">',
    OLD:`<div class="screen active" id="screen-feed">`, NEW:`<div class="screen" id="screen-feed">` },
  { name:'#2 shop active', done:'<div class="screen active" id="screen-shop">',
    OLD:`<div class="screen" id="screen-shop">`, NEW:`<div class="screen active" id="screen-shop">` },
  { name:'#2 nav-feed ไม่ active', done:`<div class="bn" id="nav-feed"`,
    OLD:`<div class="bn active" id="nav-feed"`, NEW:`<div class="bn" id="nav-feed"` },
  { name:'#2 nav-shop active', done:`commerce-entry active" id="nav-shop"`,
    OLD:`<div class="bn commerce-entry" id="nav-shop"`, NEW:`<div class="bn commerce-entry active" id="nav-shop"` },
  { name:'#2 โหลดร้านตอนเปิดแอป', done:`if (typeof loadShop === 'function' && !shopLoaded)`,
    OLD:[`function updateUIWithUser(user) {`,`  if (!user) return;`].join(NL),
    NEW:[`function updateUIWithUser(user) {`,`  if (!user) return;`,`  if (typeof loadShop === 'function' && !shopLoaded) { try { loadShop(); renderCartFab(); } catch (e) {} }`].join(NL) },

  { name:'#1 splash: apply brand cache ตอนโหลด', done:`getItem('phuan_brand')`,
    OLD:[`  <div class="ls-spinner"></div>`,`</div>`].join(NL),
    NEW:[`  <div class="ls-spinner"></div>`,`</div>`,SPLASH_SCRIPT].join(NL) },
  { name:'#1 applyBranding: update splash + cache', done:`setItem('phuan_brand'`,
    OLD:`  window._branding = b;`,
    NEW:[`  try {`,
      `    var _e1 = document.querySelector('.ls-name'); if (_e1 && name) _e1.textContent = name;`,
      `    var _e2 = document.querySelector('.ls-logo'); if (_e2 && emoji) _e2.textContent = emoji;`,
      `    var _e3 = document.querySelector('.ls-sub'); if (_e3 && b.subtitle) _e3.textContent = b.subtitle;`,
      `    localStorage.setItem('phuan_brand', JSON.stringify({ appName: name, logoEmoji: emoji, subtitle: b.subtitle, primaryColor: b.primaryColor }));`,
      `  } catch (e) {}`,
      `  window._branding = b;`].join(NL) },
];

let applied=0;
for(const e of edits){
  if(cnt(s, e.done)>0){ console.log('• '+e.name+' — ทำไปแล้ว ข้าม'); e._skip=true; continue; }
  const n=cnt(s, e.OLD);
  if(n!==1){ console.error('✗ '+e.name+' — anchor '+n+' ครั้ง (ต้อง 1)'); e._fail=true; continue; }
  s=s.replace(e.OLD, e.NEW); applied++;
}
const bad = edits.filter(e=>e._fail || (!e._skip && cnt(s,e.done)===0)).map(e=>e.name);
if(bad.length){ console.error(NL+'⛔ ไม่สำเร็จ:'+NL+'   - '+bad.join(NL+'   - ')); process.exit(1); }
if(applied===0){ console.log(NL+'✓ ทำครบแล้ว'); process.exit(0); }
fs.writeFileSync(IH, s);
console.log(NL+'✓ เขียนเสร็จ: index.html ('+applied+' จุด)');
console.log('  ขั้นต่อไป:  firebase deploy --only hosting');
