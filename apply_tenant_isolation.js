// ============================================================
//  apply_tenant_isolation.js — เพื่อนสวน
//  แยก tenant ออกจากกันใน Leaderboard (กัน tenant อื่นปน)
//   - แท็ก tenantId ให้ user: ตอนสมัคร + backfill ตอนล็อกอิน
//   - leaderboard กรองตาม tenantId ฝั่ง client (เหมือนฟีด)
//  แตะ index.html, idempotent
// ============================================================
const fs = require('fs');
const IH = 'index.html';
if(!fs.existsSync(IH)){ console.error('✗ ไม่พบ '+IH); process.exit(1); }
let s = fs.readFileSync(IH,'utf8');
const cnt=(str,sub)=>str.split(sub).length-1;

const edits = [
  { name:'user ใหม่: ใส่ tenantId', done:'tenantId:     tenantId(),',
    OLD:`      await userRef.set({
        displayName:  user.displayName,`,
    NEW:`      await userRef.set({
        tenantId:     tenantId(),
        displayName:  user.displayName,` },

  { name:'user เก่า: backfill tenantId ตอนล็อกอิน', done:'serverTimestamp(), tenantId: tenantId() }',
    OLD:`      const updates = { lastLoginAt: firebase.firestore.FieldValue.serverTimestamp() };`,
    NEW:`      const updates = { lastLoginAt: firebase.firestore.FieldValue.serverTimestamp(), tenantId: tenantId() };` },

  { name:'leaderboard: กรองตาม tenant', done:'var list = snap.docs.filter',
    OLD:`    var snap = await db.collection('users').orderBy('points', 'desc').limit(30).get();
    var rows = [], rank = 0;
    snap.forEach(function (d) {`,
    NEW:`    var snap = await db.collection('users').orderBy('points', 'desc').limit(100).get();
    var tid = (typeof tenantId === 'function') ? tenantId() : null;
    var list = snap.docs.filter(function (d) { return tid ? d.data().tenantId === tid : true; }).slice(0, 30);
    var rows = [], rank = 0;
    list.forEach(function (d) {` },
];

let applied=0;
for(const e of edits){
  if(cnt(s, e.done)>0){ console.log('• '+e.name+' — ทำไปแล้ว ข้าม'); e._skip=true; continue; }
  const n=cnt(s, e.OLD);
  if(n!==1){ console.error('✗ '+e.name+' — anchor '+n+' ครั้ง (ต้อง 1)'); e._fail=true; continue; }
  s=s.replace(e.OLD, e.NEW); applied++;
}
const bad = edits.filter(e=>e._fail || (!e._skip && cnt(s,e.done)===0)).map(e=>e.name);
if(bad.length){ console.error('\n⛔ ไม่สำเร็จ:\n   - '+bad.join('\n   - ')); process.exit(1); }
if(applied===0){ console.log('\n✓ ทำครบแล้ว'); process.exit(0); }
fs.writeFileSync(IH, s);
console.log('\n✓ เขียนเสร็จ: index.html ('+applied+' จุด)');
console.log('  ขั้นต่อไป:  firebase deploy --only hosting');
