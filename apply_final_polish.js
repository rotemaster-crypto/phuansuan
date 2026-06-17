// ============================================================
//  apply_final_polish.js — เพื่อนสวน (ตรวจรอบสุดท้าย)
//   1) ปุ่ม "แชร์" บนโพส → แชร์แอปได้จริง (navigator.share + fallback คัดลอก)
//   2) privacy-chip "🌍 สาธารณะ ▾" → ป้ายซื่อตรง "🌍 โพสสาธารณะ" (ไม่หลอกว่าเลือกได้)
//   3) ลบ 3 ฟังก์ชันตาย (toggleFollow/toggleLike/toggleHelp ไม่ถูกเรียก)
//  แตะ index.html ไฟล์เดียว, idempotent (done=ต้องมี / gone=ต้องหาย)
// ============================================================
const fs = require('fs');
const IH = 'index.html';
if(!fs.existsSync(IH)){ console.error('✗ ไม่พบ '+IH+' — รันจาก root'); process.exit(1); }
let s = fs.readFileSync(IH,'utf8');
const cnt=(str,sub)=>str.split(sub).length-1;

const SHARE_JS = `// ── Share ────────────────────────────────────────────────
async function sharePost() {
  var url = (location && location.origin) || 'https://phuansuan.web.app';
  var text = 'มาเข้าชุมชนเพื่อนสวน — แชร์ปัญหาและความรู้การเกษตร 🌿';
  try { if (navigator.share) { await navigator.share({ title: 'เพื่อนสวน', text: text, url: url }); return; } } catch (e) { return; }
  try { await navigator.clipboard.writeText(url); alert('คัดลอกลิงก์แล้ว 📋'); }
  catch (e) { try { prompt('คัดลอกลิงก์นี้:', url); } catch (e2) {} }
}

`;

const edits = [
  { name:'ปุ่มแชร์ → ทำงานจริง', done:'onclick="sharePost()"',
    OLD:`        <button class="pa"><span class="pi">↗️</span>แชร์</button>`,
    NEW:`        <button class="pa" onclick="sharePost()"><span class="pi">↗️</span>แชร์</button>` },
  { name:'privacy-chip → ป้ายซื่อตรง', done:'🌍 โพสสาธารณะ',
    OLD:`          <div class="privacy-chip">🌍 สาธารณะ ▾</div>`,
    NEW:`          <div class="privacy-chip" style="cursor:default">🌍 โพสสาธารณะ</div>` },
  { name:'ลบ 3 ฟังก์ชันตาย', gone:'function toggleFollow',
    OLD:`function toggleFollow(btn){
  const f=btn.classList.contains('following');
  btn.classList.toggle('following',!f);
  btn.textContent = f ? '+ ติดตาม' : 'กำลังติดตาม ▾';
}
function toggleLike(btn){ btn.classList.toggle('liked'); }
function toggleHelp(btn){ btn.classList.toggle('helped'); }
`, NEW:`` },
  { name:'ฟังก์ชัน sharePost', done:'function sharePost',
    OLD:`function escapeHtml(s) {`, NEW:SHARE_JS + `function escapeHtml(s) {` },
];

let applied=0;
for(const e of edits){
  const already = e.gone ? cnt(s,e.gone)===0 : cnt(s,e.done)>0;
  if(already){ console.log('• '+e.name+' — ทำไปแล้ว ข้าม'); e._skip=true; continue; }
  const n=cnt(s, e.OLD);
  if(n!==1){ console.error('✗ '+e.name+' — anchor '+n+' ครั้ง (ต้อง 1)'); e._fail=true; continue; }
  s=s.replace(e.OLD, e.NEW); applied++;
}
const bad = edits.filter(e=> e._fail || (!e._skip && (e.gone ? cnt(s,e.gone)!==0 : cnt(s,e.done)===0))).map(e=>e.name);
if(bad.length){ console.error('\n⛔ ไม่สำเร็จ — ไม่เขียนไฟล์:\n   - '+bad.join('\n   - ')); process.exit(1); }
if(applied===0){ console.log('\n✓ ทำครบแล้ว'); process.exit(0); }
fs.writeFileSync(IH, s);
console.log('\n✓ เขียนเสร็จ: index.html ('+applied+' จุด)');
console.log('  ขั้นต่อไป:  firebase deploy --only hosting');
