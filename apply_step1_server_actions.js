// ============================================================
//  apply_step1_server_actions.js — เพื่อนสวน (สเต็ป 1)
//  ย้าย "ไลก์ / ช่วยได้" ไป server-side:
//   - client เขียน doc posts/{id}/likes|helps/{uid} (1 คน/โพส กดได้ครั้งเดียว)
//   - Cloud Function เป็นคนนับ + ให้แต้มเจ้าของโพส "ครั้งเดียว" (กัน relike farm)
//   - ถอด onPostHelped (ให้แต้มตามตัวนับ = ต้นเหตุ exploit) + ถอดบวกแต้มฝั่ง client
//   - ปิด rule ไม่ให้ client แก้ตัวนับ likes/helps เอง
//  รูปแบบ: ตรวจ anchor ทุกจุดก่อน → ครบค่อยเขียน + idempotent
// ============================================================
const fs = require('fs');
function read(f){ if(!fs.existsSync(f)){ console.error('✗ ไม่พบ '+f+' — รันจาก root ของ repo'); process.exit(1);} return fs.readFileSync(f,'utf8'); }
function count(s,sub){ return s.split(sub).length - 1; }

const FN='functions/index.js', FR='firestore.rules', IH='index.html';
const buf = { [FN]:read(FN), [FR]:read(FR), [IH]:read(IH) };

const edits = [

// ── [A] functions: เพิ่ม perLike ใน PTS ──
{ name:'[A] functions: perLike ใน PTS', file:FN,
OLD:`const PTS = {
  perPost: 10, perPostWithImg: 15, perComment: 3, perHelp: 15,
};`,
NEW:`const PTS = {
  perPost: 10, perPostWithImg: 15, perComment: 3, perHelp: 15, perLike: 2,
};` },

// ── [B] functions: ถอด onPostHelped → ใส่ onLikeWrite + onHelpWrite ──
{ name:'[B] functions: onLikeWrite/onHelpWrite แทน onPostHelped', file:FN,
OLD:`exports.onPostHelped = onDocumentUpdated(
  { document: "posts/{postId}", region: "asia-southeast1" },
  async (event) => {
    const before = event.data?.before?.data();
    const after  = event.data?.after?.data();
    if (!before || !after) return;
    if ((after.helps || 0) > (before.helps || 0) && after.authorId) {
      const ref = admin.firestore().collection("users").doc(after.authorId);
      await ref.update({
        points:    admin.firestore.FieldValue.increment(PTS.perHelp),
        helpCount: admin.firestore.FieldValue.increment(1),
      });
      await updateTier(ref);
    }
  }
);`,
NEW:`// ── ไลก์/ช่วยได้ → server-side: 1 คน/โพส, ให้แต้มเจ้าของครั้งเดียว ──
const { onDocumentWritten } = require("firebase-functions/v2/firestore");

async function awardOnce(db, postId, actorUid, markerCol, authorId, pts, extra) {
  if (!authorId || actorUid === authorId) return;        // ไม่ให้แต้มกดของตัวเอง
  const marker = db.collection("posts").doc(postId).collection(markerCol).doc(actorUid);
  const got = await marker.get();
  if (got.exists) return;                                 // เคยให้แต้มแล้ว ข้าม
  await marker.set({ at: admin.firestore.FieldValue.serverTimestamp() });
  const uref = db.collection("users").doc(authorId);
  await uref.update(Object.assign({ points: admin.firestore.FieldValue.increment(pts) }, extra || {}));
  await updateTier(uref);
}

exports.onLikeWrite = onDocumentWritten(
  { document: "posts/{postId}/likes/{uid}", region: "asia-southeast1" },
  async (event) => {
    const had = event.data?.before?.exists, has = event.data?.after?.exists;
    const db = admin.firestore();
    const postRef = db.collection("posts").doc(event.params.postId);
    if (!had && has) {
      const p = await postRef.get(); if (!p.exists) return;
      await postRef.update({ likes: admin.firestore.FieldValue.increment(1) });
      await awardOnce(db, event.params.postId, event.params.uid, "likeAwarded", p.data().authorId, PTS.perLike);
    } else if (had && !has) {
      const p = await postRef.get(); if (!p.exists) return;
      await postRef.update({ likes: admin.firestore.FieldValue.increment(-1) });
    }
  }
);

exports.onHelpWrite = onDocumentWritten(
  { document: "posts/{postId}/helps/{uid}", region: "asia-southeast1" },
  async (event) => {
    const had = event.data?.before?.exists, has = event.data?.after?.exists;
    const db = admin.firestore();
    const postRef = db.collection("posts").doc(event.params.postId);
    if (!had && has) {
      const p = await postRef.get(); if (!p.exists) return;
      await postRef.update({ helps: admin.firestore.FieldValue.increment(1) });
      await awardOnce(db, event.params.postId, event.params.uid, "helpAwarded", p.data().authorId, PTS.perHelp, { helpCount: admin.firestore.FieldValue.increment(1) });
    } else if (had && !has) {
      const p = await postRef.get(); if (!p.exists) return;
      await postRef.update({ helps: admin.firestore.FieldValue.increment(-1) });
    }
  }
);` },

// ── [C] rules: ปิดไม่ให้ client แก้ตัวนับ likes/helps (เหลือ comments) ──
{ name:'[C] rules: posts update เหลือเฉพาะ comments', file:FR,
OLD:`      allow update: if isAdmin()
        || (signedIn()
            && request.resource.data.diff(resource.data)
                 .affectedKeys().hasOnly(['likes', 'helps', 'comments']));`,
NEW:`      allow update: if isAdmin()
        || (signedIn()
            && request.resource.data.diff(resource.data)
                 .affectedKeys().hasOnly(['comments']));` },

// ── [D] rules: เพิ่ม subcollection likes/helps (1 doc/user) ──
{ name:'[D] rules: likes/helps subcollection', file:FR,
OLD:`      match /comments/{commentId} {
        allow read: if signedIn();
        allow create: if signedIn()
          && request.resource.data.authorId == request.auth.uid;
        allow update: if false;
        allow delete: if isAdmin()
          || (signedIn() && resource.data.authorId == request.auth.uid);
      }`,
NEW:`      match /comments/{commentId} {
        allow read: if signedIn();
        allow create: if signedIn()
          && request.resource.data.authorId == request.auth.uid;
        allow update: if false;
        allow delete: if isAdmin()
          || (signedIn() && resource.data.authorId == request.auth.uid);
      }

      // ── Likes / Helps (1 doc ต่อ user — server เป็นคนนับ+ให้แต้ม) ──
      match /likes/{uid} {
        allow read: if signedIn();
        allow create, delete: if isOwner(uid);
        allow update: if false;
      }
      match /helps/{uid} {
        allow read: if signedIn();
        allow create, delete: if isOwner(uid);
        allow update: if false;
      }` },

// ── [E] client: likePost → เขียน doc ──
{ name:'[E] client: likePost server-side', file:IH,
OLD:`async function likePost(id, btn) {
  if (!currentUser || !db) return;
  btn.classList.toggle('liked');
  const inc = btn.classList.contains('liked') ? 1 : -1;
  try {
    await db.collection('posts').doc(id).update({ likes: firebase.firestore.FieldValue.increment(inc) });
    const el = document.getElementById('likes-' + id);
    if (el) el.textContent = Math.max(0, parseInt(el.textContent) + inc);
    if (inc > 0) {
      await db.collection('users').doc(currentUser.uid).update({ points: firebase.firestore.FieldValue.increment(APP_CONFIG.points.perLike || 2) });
    }
  } catch(e) { console.error(e); }
}`,
NEW:`async function likePost(id, btn) {
  if (!currentUser || !db) return;
  btn.classList.toggle('liked');
  const liked = btn.classList.contains('liked');
  const inc = liked ? 1 : -1;
  const el = document.getElementById('likes-' + id);
  if (el) el.textContent = Math.max(0, parseInt(el.textContent || '0') + inc);
  const ref = db.collection('posts').doc(id).collection('likes').doc(currentUser.uid);
  try {
    if (liked) await ref.set({ at: firebase.firestore.FieldValue.serverTimestamp() });
    else await ref.delete();
  } catch(e) {
    console.error(e);
    btn.classList.toggle('liked');
    if (el) el.textContent = Math.max(0, parseInt(el.textContent || '0') - inc);
  }
}` },

// ── [F] client: helpPost → เขียน doc ──
{ name:'[F] client: helpPost server-side', file:IH,
OLD:`async function helpPost(id, btn) {
  if (!currentUser || !db) return;
  btn.classList.toggle('helped');
  const inc = btn.classList.contains('helped') ? 1 : -1;
  try {
    await db.collection('posts').doc(id).update({ helps: firebase.firestore.FieldValue.increment(inc) });
    if (inc > 0) {
      await db.collection('users').doc(currentUser.uid).update({ points: firebase.firestore.FieldValue.increment(APP_CONFIG.points.perHelp || 15), helpCount: firebase.firestore.FieldValue.increment(1) });
    }
  } catch(e) { console.error(e); }
}`,
NEW:`async function helpPost(id, btn) {
  if (!currentUser || !db) return;
  btn.classList.toggle('helped');
  const helped = btn.classList.contains('helped');
  const ref = db.collection('posts').doc(id).collection('helps').doc(currentUser.uid);
  try {
    if (helped) await ref.set({ at: firebase.firestore.FieldValue.serverTimestamp() });
    else await ref.delete();
  } catch(e) {
    console.error(e);
    btn.classList.toggle('helped');
  }
}` },
];

// เฟส 1: ตรวจ anchor
let ok=true, skip=0;
for(const e of edits){
  const s=buf[e.file];
  if(s.includes(e.NEW)){ console.log('• '+e.name+' — patched แล้ว ข้าม'); e._skip=true; skip++; continue; }
  const n=count(s,e.OLD);
  if(n!==1){ console.error('✗ '+e.name+' — anchor '+n+' ครั้ง (ต้อง 1) → ยกเลิกทั้งหมด'); ok=false; }
}
if(!ok){ console.error('\n⛔ anchor ไม่ตรง — ไม่เขียนไฟล์ใด ๆ'); process.exit(1); }
if(skip===edits.length){ console.log('\n✓ patched อยู่แล้วทั้งหมด'); process.exit(0); }

// เฟส 2: เขียน
for(const e of edits){ if(!e._skip) buf[e.file]=buf[e.file].replace(e.OLD,e.NEW); }
fs.writeFileSync(FN,buf[FN]); fs.writeFileSync(FR,buf[FR]); fs.writeFileSync(IH,buf[IH]);
console.log('\n✓ เขียนเสร็จ: functions/index.js, firestore.rules, index.html');
console.log('  ขั้นต่อไป:  firebase deploy   (deploy เต็ม: functions + rules + hosting)');
