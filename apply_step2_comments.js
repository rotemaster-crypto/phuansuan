// ============================================================
//  apply_step2_comments.js — เพื่อนสวน (สเต็ป 2)
//   - ตัวนับ comments ย้ายไปฝั่ง server (onCommentCreated/onCommentDeleted)
//   - ถอดการบวกแต้ม + อัปตัวนับฝั่ง client ใน addComment (แก้ "แต้มซ้ำซ้อน")
//   - ปิด rule: posts update = admin เท่านั้น (client แก้ตัวนับไม่ได้อีก)
//  ใช้ต่อจาก step1 — รูปแบบ check-all-then-write + idempotent
// ============================================================
const fs = require('fs');
function read(f){ if(!fs.existsSync(f)){ console.error('✗ ไม่พบ '+f+' — รันจาก root ของ repo'); process.exit(1);} return fs.readFileSync(f,'utf8'); }
function count(s,sub){ return s.split(sub).length - 1; }

const FN='functions/index.js', FR='firestore.rules', IH='index.html';
const buf = { [FN]:read(FN), [FR]:read(FR), [IH]:read(IH) };

const edits = [

// ── [A] functions: onCommentCreated นับ server + เพิ่ม onCommentDeleted ──
{ name:'[A] functions: comment counter ฝั่ง server', file:FN,
OLD:`exports.onCommentCreated = onDocumentCreated(
  { document: "posts/{postId}/comments/{commentId}", region: "asia-southeast1" },
  async (event) => {
    const cmt = event.data?.data();
    if (!cmt?.authorId) return;
    const ref = admin.firestore().collection("users").doc(cmt.authorId);
    await ref.update({ points: admin.firestore.FieldValue.increment(PTS.perComment) });
    await updateTier(ref);
  }
);`,
NEW:`exports.onCommentCreated = onDocumentCreated(
  { document: "posts/{postId}/comments/{commentId}", region: "asia-southeast1" },
  async (event) => {
    const cmt = event.data?.data();
    if (!cmt?.authorId) return;
    // นับคอมเมนต์ฝั่ง server (client แก้ไม่ได้แล้ว)
    await admin.firestore().collection("posts").doc(event.params.postId)
      .update({ comments: admin.firestore.FieldValue.increment(1) }).catch(() => {});
    const ref = admin.firestore().collection("users").doc(cmt.authorId);
    await ref.update({ points: admin.firestore.FieldValue.increment(PTS.perComment) });
    await updateTier(ref);
  }
);

// ลบคอมเมนต์ → ลดตัวนับ (กันค้างเกินจริง)
const { onDocumentDeleted } = require("firebase-functions/v2/firestore");
exports.onCommentDeleted = onDocumentDeleted(
  { document: "posts/{postId}/comments/{commentId}", region: "asia-southeast1" },
  async (event) => {
    await admin.firestore().collection("posts").doc(event.params.postId)
      .update({ comments: admin.firestore.FieldValue.increment(-1) }).catch(() => {});
  }
);` },

// ── [B] rules: posts update = admin เท่านั้น ──
{ name:'[B] rules: posts update admin-only', file:FR,
OLD:`      allow update: if isAdmin()
        || (signedIn()
            && request.resource.data.diff(resource.data)
                 .affectedKeys().hasOnly(['comments']));`,
NEW:`      allow update: if isAdmin();` },

// ── [C] client: addComment ถอด counter+points (server ทำให้แล้ว) ──
{ name:'[C] client: addComment ไม่บวกแต้ม/นับเองแล้ว', file:IH,
OLD:`    await db.collection('posts').doc(postId).collection('comments').add({
      text, authorId: currentUser.uid, authorName: currentUser.displayName, authorPhoto: currentUser.photoUrl || '',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await db.collection('posts').doc(postId).update({ comments: firebase.firestore.FieldValue.increment(1) });
    await db.collection('users').doc(currentUser.uid).update({ points: firebase.firestore.FieldValue.increment(APP_CONFIG.points.perComment || 3) });
    input.value = '';`,
NEW:`    await db.collection('posts').doc(postId).collection('comments').add({
      text, authorId: currentUser.uid, authorName: currentUser.displayName, authorPhoto: currentUser.photoUrl || '',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    input.value = '';`  },
];

// เฟส 1: ตรวจ anchor
let ok=true, skip=0;
for(const e of edits){
  const s=buf[e.file];
  if(s.includes(e.NEW)){ console.log('• '+e.name+' — patched แล้ว ข้าม'); e._skip=true; skip++; continue; }
  const n=count(s,e.OLD);
  if(n!==1){ console.error('✗ '+e.name+' — anchor '+n+' ครั้ง (ต้อง 1) → ยกเลิกทั้งหมด'); ok=false; }
}
if(!ok){ console.error('\n⛔ anchor ไม่ตรง — ไม่เขียนไฟล์ใด ๆ (อาจยังไม่ได้รัน step1?)'); process.exit(1); }
if(skip===edits.length){ console.log('\n✓ patched อยู่แล้วทั้งหมด'); process.exit(0); }

// เฟส 2: เขียน
for(const e of edits){ if(!e._skip) buf[e.file]=buf[e.file].replace(e.OLD,e.NEW); }
fs.writeFileSync(FN,buf[FN]); fs.writeFileSync(FR,buf[FR]); fs.writeFileSync(IH,buf[IH]);
console.log('\n✓ เขียนเสร็จ: functions/index.js, firestore.rules, index.html');
console.log('  ขั้นต่อไป:  firebase deploy   (deploy เต็ม: functions + rules + hosting)');
