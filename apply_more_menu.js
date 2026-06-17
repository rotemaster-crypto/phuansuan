// ============================================================
//  apply_more_menu.js — เพื่อนสวน
//  ปุ่ม "••• เพิ่มเติม" ในโปรไฟล์ → เมนูจริง: ติดต่อร้าน + ออกจากระบบ (LIFF-aware)
//  + เก็บ default location ปลอม (📍 อ.บ้านโป่ง ราชบุรี) ที่โผล่แวบ
//  idempotent: เช็ค sentinel 'done' (มีแล้ว=ข้าม), แตะ index.html อย่างเดียว
// ============================================================
const fs = require('fs');
const IH = 'index.html';
if(!fs.existsSync(IH)){ console.error('✗ ไม่พบ '+IH+' — รันจาก root'); process.exit(1); }
let s = fs.readFileSync(IH,'utf8');
const cnt=(str,sub)=>str.split(sub).length-1;

const MENU_MODAL = `<!-- ══ MORE MENU ══ -->
<div class="overlay" id="moreMenuModal" onclick="if(event.target===this)closeMoreMenu()">
  <div class="modal" style="border-radius:16px 16px 0 0">
    <div class="modal-body" style="padding:10px 0 18px">
      <div onclick="contactShop()" style="display:flex;align-items:center;gap:12px;padding:15px 18px;cursor:pointer;font-size:15px;color:var(--text)">
        <span style="font-size:20px">🏪</span> ติดต่อร้าน DemeterRich
      </div>
      <div onclick="doLogout()" style="display:flex;align-items:center;gap:12px;padding:15px 18px;cursor:pointer;font-size:15px;color:#e41e3f;border-top:1px solid var(--border)">
        <span style="font-size:20px">🚪</span> ออกจากระบบ
      </div>
    </div>
  </div>
</div>

<div class="bottom-nav">`;

const MENU_JS = `// ── More menu (โปรไฟล์) ───────────────────────────────────
function openMoreMenu() { var m = document.getElementById('moreMenuModal'); if (m) m.classList.add('open'); }
function closeMoreMenu() { var m = document.getElementById('moreMenuModal'); if (m) m.classList.remove('open'); }
function contactShop() {
  var url = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.shop && APP_CONFIG.shop.lineShopUrl) || '';
  closeMoreMenu();
  if (url) window.open(url, '_blank');
}
async function doLogout() {
  if (!confirm('ออกจากระบบ?')) return;
  try { if (typeof liff !== 'undefined' && liff.logout && liff.isLoggedIn && liff.isLoggedIn()) liff.logout(); } catch (e) {}
  try { await firebase.auth().signOut(); } catch (e) {}
  location.reload();
}

`;

const edits = [
  { name:'ปุ่มเพิ่มเติม → เปิดเมนู', done:'onclick="openMoreMenu()"',
    OLD:`        <button class="prof-btn-s">••• เพิ่มเติม</button>`,
    NEW:`        <button class="prof-btn-s" onclick="openMoreMenu()">••• เพิ่มเติม</button>` },

  { name:'default location ปลอมในโปรไฟล์', done:`id="prof-sub"></div>`,
    OLD:`    <div class="prof-sub" id="prof-sub">📍 อ.บ้านโป่ง ราชบุรี</div>`,
    NEW:`    <div class="prof-sub" id="prof-sub"></div>` },

  { name:'เมนู (modal)', done:'id="moreMenuModal"',
    OLD:`<div class="bottom-nav">`, NEW:MENU_MODAL },

  { name:'ฟังก์ชันเมนู (เปิด/ติดต่อร้าน/ออกจากระบบ)', done:'function openMoreMenu',
    OLD:`function escapeHtml(s) {`, NEW:MENU_JS + `function escapeHtml(s) {` },
];

let applied=0;
for(const e of edits){
  if(cnt(s, e.done)>0){ console.log('• '+e.name+' — ทำไปแล้ว ข้าม'); e._skip=true; continue; }
  const n=cnt(s, e.OLD);
  if(n!==1){ console.error('✗ '+e.name+' — anchor '+n+' ครั้ง (ต้อง 1)'); e._fail=true; continue; }
  s=s.replace(e.OLD, e.NEW); applied++;
}
const bad = edits.filter(e=>e._fail || (!e._skip && cnt(s,e.done)===0)).map(e=>e.name);
if(bad.length){ console.error('\n⛔ ไม่สำเร็จ — ไม่เขียนไฟล์:\n   - '+bad.join('\n   - ')); process.exit(1); }
if(applied===0){ console.log('\n✓ ทำครบแล้ว'); process.exit(0); }
fs.writeFileSync(IH, s);
console.log('\n✓ เขียนเสร็จ: index.html ('+applied+' จุด)');
console.log('  ขั้นต่อไป:  firebase deploy --only hosting');
