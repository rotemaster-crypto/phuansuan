// ============================================================
//  apply_notif_thai.js — เพื่อนสวน
//  แปลข้อความแจ้งเตือนเป็นไทย (functions/index.js 3 จุด)
//  idempotent: ถ้าเจอข้อความไทยแล้ว = แปลแล้ว ข้าม
// ============================================================
const fs = require('fs');
const FN = 'functions/index.js';
if(!fs.existsSync(FN)){ console.error('✗ ไม่พบ '+FN+' — รันจาก root'); process.exit(1); }
let s = fs.readFileSync(FN,'utf8');
const cnt=(str,sub)=>str.split(sub).length-1;

const edits = [
  { name:'คอมเมนต์', done:'แสดงความคิดเห็นในโพสของคุณ',
    OLD:`(cmt.authorName||"someone")+" commented on your post"`,
    NEW:`(cmt.authorName||"มีผู้ใช้")+" แสดงความคิดเห็นในโพสของคุณ"` },
  { name:'ช่วยได้', done:'มีคนกดว่าโพสของคุณช่วยได้',
    OLD:`"Someone marked your post as helpful"`,
    NEW:`"มีคนกดว่าโพสของคุณช่วยได้"` },
  { name:'เลื่อน tier', done:'ยินดีด้วย! คุณเลื่อนระดับเป็น',
    OLD:`"Congrats! You reached "+( label[a.tier]||a.tier)`,
    NEW:`"ยินดีด้วย! คุณเลื่อนระดับเป็น "+( label[a.tier]||a.tier)` },
];

let applied=0;
for(const e of edits){
  if(cnt(s, e.done)>0){ console.log('• '+e.name+' — แปลแล้ว ข้าม'); e._skip=true; continue; }
  const n=cnt(s, e.OLD);
  if(n!==1){ console.error('✗ '+e.name+' — anchor '+n+' ครั้ง (ต้อง 1)'); e._fail=true; continue; }
  s=s.replace(e.OLD, e.NEW); applied++;
}
const bad = edits.filter(e=>e._fail || (!e._skip && cnt(s,e.done)===0)).map(e=>e.name);
if(bad.length){ console.error('\n⛔ ไม่สำเร็จ:\n   - '+bad.join('\n   - ')); process.exit(1); }
if(applied===0){ console.log('\n✓ แปลครบแล้ว'); process.exit(0); }
fs.writeFileSync(FN, s);
console.log('\n✓ เขียนเสร็จ: functions/index.js ('+applied+' จุด)');
console.log('  ขั้นต่อไป:  firebase deploy --only functions');
