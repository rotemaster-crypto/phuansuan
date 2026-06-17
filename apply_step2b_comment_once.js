// ============================================================
//  apply_step2b_comment_once.js — เพื่อนสวน
//  คอมเมนต์: ให้แต้ม "ครั้งแรกต่อโพสต่อ user" เท่านั้น (กันสแปมฟาร์มแต้ม)
//  - ตัวนับ comments ยังนับทุกคอมเมนต์ (ไม่เปลี่ยน)
//  - ใช้ marker commentAwarded/{uid} ใต้โพส (server-only)
//  ใช้ต่อจาก step2 — แตะ functions/index.js ไฟล์เดียว, idempotent
// ============================================================
const fs = require('fs');
const FN = 'functions/index.js';
if(!fs.existsSync(FN)){ console.error('✗ ไม่พบ '+FN+' — รันจาก root ของ repo'); process.exit(1); }
let s = fs.readFileSync(FN,'utf8');

const OLD = `exports.onCommentCreated = onDocumentCreated(
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
);`;

const NEW = `exports.onCommentCreated = onDocumentCreated(
  { document: "posts/{postId}/comments/{commentId}", region: "asia-southeast1" },
  async (event) => {
    const cmt = event.data?.data();
    if (!cmt?.authorId) return;
    const db = admin.firestore();
    // นับคอมเมนต์ฝั่ง server (ทุกคอมเมนต์)
    await db.collection("posts").doc(event.params.postId)
      .update({ comments: admin.firestore.FieldValue.increment(1) }).catch(() => {});
    // แต้ม: ให้ครั้งแรกต่อโพสต่อ user เท่านั้น (กันสแปมฟาร์มแต้ม)
    const marker = db.collection("posts").doc(event.params.postId)
      .collection("commentAwarded").doc(cmt.authorId);
    if ((await marker.get()).exists) return;
    await marker.set({ at: admin.firestore.FieldValue.serverTimestamp() });
    const ref = db.collection("users").doc(cmt.authorId);
    await ref.update({ points: admin.firestore.FieldValue.increment(PTS.perComment) });
    await updateTier(ref);
  }
);`;

if(s.includes(NEW)){ console.log('✓ patched อยู่แล้ว ไม่ต้องทำซ้ำ'); process.exit(0); }
const n = s.split(OLD).length - 1;
if(n!==1){ console.error('✗ anchor เจอ '+n+' ครั้ง (ต้อง 1) — ยังไม่ได้รัน step2? ยกเลิก ไม่เขียนไฟล์'); process.exit(1); }
s = s.replace(OLD, NEW);
fs.writeFileSync(FN, s);
console.log('✓ เขียนเสร็จ: functions/index.js — คอมเมนต์ให้แต้มครั้งแรกต่อโพส');
console.log('  ขั้นต่อไป:  firebase deploy --only functions');
