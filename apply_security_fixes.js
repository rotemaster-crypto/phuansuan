// ============================================================
//  apply_security_fixes.js — เพื่อนสวน
//  แก้ 2 จุดแดงก่อนเปิดขายจริง:
//   [1] firestore.rules : กันผู้ใช้ปั่นแต้ม (points) เอง → กระโดด tier → ส่วนลดฟรี
//   [2] storage.rules + index.html : สลิปโอนเงินอ่านได้เฉพาะเจ้าของ/แอดมิน
//  รูปแบบ: ตรวจ anchor ทุกจุดก่อน → ถ้าครบค่อยเขียนทุกไฟล์ (กันแก้ครึ่ง ๆ)
//          กันรันซ้ำ (idempotent) — รันแล้วรันอีกได้ ไม่พัง
// ============================================================
const fs = require('fs');

function read(f){ if(!fs.existsSync(f)){ console.error('✗ ไม่พบไฟล์ '+f+' — รันจาก root ของ repo'); process.exit(1);} return fs.readFileSync(f,'utf8'); }
function count(s,sub){ return s.split(sub).length - 1; }

// ---- โหลดไฟล์ ----
const FR='firestore.rules', SR='storage.rules', IH='index.html';
let fr=read(FR), sr=read(SR), ih=read(IH);

// ---- นิยาม anchor (OLD) / ผลลัพธ์ (NEW) ----
const edits = [
  { name:'[1a] firestore: create user — จำกัดแต้มเริ่มต้น/บล็อก tier', file:FR,
    OLD:
`      allow create: if isOwner(uid)
        && request.resource.data.get('banned', false) == false;`,
    NEW:
`      allow create: if isOwner(uid)
        && request.resource.data.get('banned', false) == false
        && request.resource.data.get('tier', 'bronze') == 'bronze'
        && request.resource.data.get('points', 0) <= 20;` },

  { name:'[1b] firestore: update user — จำกัดเพิ่มแต้มครั้งละ ≤20, ห้ามลด', file:FR,
    OLD:
`      allow update: if isAdmin()
        || (isOwner(uid)
            && !request.resource.data.diff(resource.data)
                 .affectedKeys().hasAny(['banned', 'tier']));`,
    NEW:
`      allow update: if isAdmin()
        || (isOwner(uid)
            && !request.resource.data.diff(resource.data)
                 .affectedKeys().hasAny(['banned', 'tier'])
            && request.resource.data.get('points', 0)
                 <= resource.data.get('points', 0) + 20
            && request.resource.data.get('points', 0)
                 >= resource.data.get('points', 0));` },

  { name:'[2a] storage: สลิป — อ่าน/เขียนเฉพาะเจ้าของ (uid ใน path) หรือ admin', file:SR,
    OLD:
`    match /slips/{tenant}/{fileName} {
      allow read: if signedIn();
      allow write: if signedIn() && isImage() && underLimit(5);
    }`,
    NEW:
`    match /slips/{tenant}/{uid}/{fileName} {
      allow read:  if isAdmin() || (signedIn() && request.auth.uid == uid);
      allow write: if signedIn() && request.auth.uid == uid && isImage() && underLimit(5);
    }` },

  { name:'[2b] index.html: อัปสลิปใส่ uid ใน path', file:IH,
    OLD:`const ref = firebase.storage().ref('slips/'+tid+'/'+pendingOrder.id+'_'+Date.now()+'.jpg');`,
    NEW:`const ref = firebase.storage().ref('slips/'+tid+'/'+currentUser.uid+'/'+pendingOrder.id+'_'+Date.now()+'.jpg');` },
];

const buf = { [FR]:fr, [SR]:sr, [IH]:ih };

// ---- เฟส 1: ตรวจทุก anchor ก่อน (ยังไม่เขียน) ----
let allOk=true, skipped=0;
for(const e of edits){
  const s = buf[e.file];
  if(s.includes(e.NEW)){ console.log('• '+e.name+' — patched แล้ว ข้าม'); e._skip=true; skipped++; continue; }
  const n = count(s, e.OLD);
  if(n!==1){ console.error('✗ '+e.name+' — เจอ anchor '+n+' ครั้ง (ต้องเจอ 1) → ยกเลิกทั้งหมด ไม่เขียนไฟล์'); allOk=false; }
}
if(!allOk){ console.error('\n⛔ มี anchor ไม่ตรง — ไม่เขียนไฟล์ใด ๆ (ปลอดภัย)'); process.exit(1); }
if(skipped===edits.length){ console.log('\n✓ ทุกจุด patched อยู่แล้ว ไม่มีอะไรต้องทำ'); process.exit(0); }

// ---- เฟส 2: ทุก anchor ผ่าน → เขียนจริง ----
for(const e of edits){ if(e._skip) continue; buf[e.file] = buf[e.file].replace(e.OLD, e.NEW); }
fs.writeFileSync(FR, buf[FR]);
fs.writeFileSync(SR, buf[SR]);
fs.writeFileSync(IH, buf[IH]);

console.log('\n✓ เขียนไฟล์เสร็จ: firestore.rules, storage.rules, index.html');
console.log('  ขั้นต่อไป:  firebase deploy   (ต้อง deploy เต็ม เพราะแก้ rules)');
