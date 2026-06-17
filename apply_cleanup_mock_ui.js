// ============================================================
//  apply_cleanup_mock_ui.js — เพื่อนสวน (Part A)  [v3]
//  ลบ UI ปลอม/ปุ่มตาย (🔔 ไม่ลบ — ทำจริงใน Part B)
//  v3: sentinel สตอรี่ใช้ค่า unique + เพิ่มลบชื่อ default ปลอมในโปรไฟล์
//      มีตรวจหลังเขียนว่าลบจริงทุกตัว ไม่งั้น error ไม่เขียนไฟล์
// ============================================================
const fs = require('fs');
const IH = 'index.html';
if(!fs.existsSync(IH)){ console.error('✗ ไม่พบ '+IH+' — รันจาก root ของ repo'); process.exit(1); }
let s = fs.readFileSync(IH,'utf8');
const cnt = (str,sub)=> str.split(sub).length - 1;

const edits = [
  { name:'ปุ่มค้นหา 🔍 (ตาย)', gone:'style="font-size:16px">🔍',
    OLD:`  <button class="tb-btn" style="font-size:16px">🔍</button>\n` },
  { name:'ปุ่ม 💬 + badge 5 (ปลอม)', gone:'<span class="tb-badge">5</span>',
    OLD:`  <button class="tb-btn">💬<span class="tb-badge">5</span></button>\n` },
  { name:'โลโก้ default facebook → เพื่อนสวน', gone:'>facebook</div>',
    OLD:`id="app-logo">facebook</div>`, NEW:`id="app-logo">เพื่อนสวน</div>` },
  { name:'ชื่อ default ปลอมในโปรไฟล์', gone:'>ลุงสมชาย วงษ์เกษตร<',
    OLD:`<div class="prof-name" id="prof-name">ลุงสมชาย วงษ์เกษตร</div>`,
    NEW:`<div class="prof-name" id="prof-name"></div>` },
  { name:'แท็บ รายการโปรด', gone:'รายการโปรด',
    OLD:`    <div class="ftab" onclick="switchFeedTab(this)">รายการโปรด</div>\n` },
  { name:'แถบสตอรี่ปลอม (regex)', gone:'<div class="stories-bar">',
    RE:/[ ]*<div class="stories-bar">[\s\S]*?ลุงวิชัย<\/div><\/div>\n[ ]*<\/div>\n/ },
  { name:'badge ปลอม "2" (nav ชุมชน)', gone:'bn-badge">2',
    OLD:`    <span class="bn-badge">2</span>\n` },
  { name:'แท็บ วิดีโอ 🎬', gone:'>วิดีโอ</div>',
    OLD:`  <div class="bn" onclick="openPostModal()">\n    <div class="bn-ico">🎬</div>\n    <div class="bn-lbl">วิดีโอ</div>\n  </div>\n` },
  { name:'สถิติ ผู้ติดตาม', gone:'ผู้ติดตาม',
    OLD:`      <div class="ps"><div class="ps-n" id="stat-followers">0</div><div class="ps-l">ผู้ติดตาม</div></div>\n` },
  { name:'แท็บโปรไฟล์ตาย (เกี่ยวกับ/รูปภาพ/สินค้าที่ใช้)', gone:'>เกี่ยวกับ</div>',
    OLD:`    <div class="pnav">เกี่ยวกับ</div>\n    <div class="pnav">รูปภาพ</div>\n    <div class="pnav">สินค้าที่ใช้</div>\n` },
];

let applied=0;
for(const e of edits){
  if(cnt(s, e.gone)===0){ console.log('• '+e.name+' — ทำไปแล้ว ข้าม'); e._skip=true; continue; }
  s = e.RE ? s.replace(e.RE, e.NEW||'') : s.replace(e.OLD, e.NEW||'');
  applied++;
}
const fail = edits.filter(e=>!e._skip && cnt(s, e.gone)!==0).map(e=>e.name);
if(fail.length){
  console.error('\n⛔ ลบไม่สำเร็จ (anchor ไม่ตรง) — ไม่เขียนไฟล์:\n   - '+fail.join('\n   - '));
  process.exit(1);
}
if(applied===0){ console.log('\n✓ ลบครบแล้ว ไม่มีอะไรต้องทำ'); process.exit(0); }
fs.writeFileSync(IH, s);
console.log('\n✓ เขียนเสร็จ: index.html — ลบ/แก้ '+applied+' จุด, ยืนยันแล้วว่าหายจริง');
console.log('  ขั้นต่อไป:  firebase deploy --only hosting');
