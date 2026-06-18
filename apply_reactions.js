// ============================================================
//  apply_reactions.js — เพื่อนสวน (แผน B: รีแอคชันหลายอีโมจิ)
//   - rules: เจ้าของแก้ type รีแอคชันของตัวเองได้
//   - functions: onLikeWrite นับ reactions map ต่อชนิด (คง likes รวม + แต้มเดิม)
//   - client: ปุ่มเปิด picker 5 อีโมจิ + สรุปอีโมจิบนโพส
//  3 ไฟล์, idempotent (done sentinel)
// ============================================================
const fs = require('fs');
const FR='firestore.rules', FN='functions/index.js', IH='index.html';
for(const f of [FR,FN,IH]){ if(!fs.existsSync(f)){ console.error('✗ ไม่พบ '+f); process.exit(1); } }
const buf={ [FR]:fs.readFileSync(FR,'utf8'), [FN]:fs.readFileSync(FN,'utf8'), [IH]:fs.readFileSync(IH,'utf8') };
const cnt=(s,sub)=>s.split(sub).length-1;

const REACT_JS = `// ── Reactions (หลายอีโมจิ) ───────────────────────────────
const REACTIONS = [
  { key:'like', emoji:'👍', label:'ถูกใจ' },
  { key:'love', emoji:'❤️', label:'รักเลย' },
  { key:'haha', emoji:'😆', label:'ฮา' },
  { key:'wow',  emoji:'😮', label:'ว้าว' },
  { key:'sad',  emoji:'😢', label:'เศร้า' },
];
function reactionEmojis(p) {
  var rx = (p && p.reactions) || {};
  return REACTIONS.filter(function (r) { return (rx[r.key] || 0) > 0; }).map(function (r) { return r.emoji; }).slice(0, 3).join('');
}
function ensureReactPicker() {
  if (document.getElementById('rx-picker')) return;
  var pk = document.createElement('div');
  pk.id = 'rx-picker';
  pk.style.cssText = 'position:fixed;z-index:9999;display:none;align-items:center;gap:4px;background:#fff;border:1px solid var(--border);border-radius:24px;padding:6px 8px;box-shadow:0 4px 16px rgba(0,0,0,.2)';
  pk.innerHTML = REACTIONS.map(function (r) {
    return '<span onclick="setReaction(\\'' + r.key + '\\')" title="' + r.label + '" style="font-size:28px;cursor:pointer;padding:2px 4px;display:inline-block">' + r.emoji + '</span>';
  }).join('');
  document.body.appendChild(pk);
  document.addEventListener('click', function (e) {
    var p = document.getElementById('rx-picker');
    var ctx = window._rxCtx;
    if (p && p.style.display === 'flex' && !p.contains(e.target) && !(ctx && ctx.btn && ctx.btn.contains(e.target))) hideReactPicker();
  });
}
function hideReactPicker() { var p = document.getElementById('rx-picker'); if (p) p.style.display = 'none'; }
function toggleReactPicker(event, id, btn) {
  if (event) event.stopPropagation();
  ensureReactPicker();
  var pk = document.getElementById('rx-picker');
  if (window._rxCtx && window._rxCtx.id === id && pk.style.display === 'flex') { hideReactPicker(); return; }
  window._rxCtx = { id: id, btn: btn };
  pk.style.display = 'flex';
  var r = btn.getBoundingClientRect();
  var pw = pk.offsetWidth || 240, ph = pk.offsetHeight || 48;
  pk.style.left = Math.min(Math.max(8, r.left), window.innerWidth - pw - 8) + 'px';
  pk.style.top = Math.max(8, r.top - ph - 8) + 'px';
}
function setReactBtn(btn, id, type) {
  btn.setAttribute('data-rx', type || '');
  var r = REACTIONS.filter(function (x) { return x.key === type; })[0];
  var ico = document.getElementById('rx-ico-' + id), lbl = document.getElementById('rx-lbl-' + id);
  if (type && r) {
    if (ico) ico.textContent = r.emoji;
    if (lbl) { lbl.textContent = r.label; lbl.style.color = 'var(--primary)'; }
    btn.classList.add('liked');
  } else {
    if (ico) ico.textContent = '👍';
    if (lbl) { lbl.textContent = 'ถูกใจ'; lbl.style.color = ''; }
    btn.classList.remove('liked');
  }
}
async function setReaction(type) {
  var ctx = window._rxCtx; if (!ctx || !currentUser || !db) return;
  hideReactPicker();
  var ref = db.collection('posts').doc(ctx.id).collection('likes').doc(currentUser.uid);
  var cur = ctx.btn.getAttribute('data-rx') || '';
  var el = document.getElementById('likes-' + ctx.id);
  try {
    if (cur === type) {
      await ref.delete();
      setReactBtn(ctx.btn, ctx.id, '');
      if (el) el.textContent = Math.max(0, parseInt(el.textContent || '0') - 1);
    } else {
      await ref.set({ type: type, at: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      var wasNone = !cur;
      setReactBtn(ctx.btn, ctx.id, type);
      if (el && wasNone) el.textContent = (parseInt(el.textContent || '0') + 1);
    }
  } catch (e) { console.error('react:', e); }
}

`;

const NEW_ONLIKE = `exports.onLikeWrite = onDocumentWritten(
  { document: "posts/{postId}/likes/{uid}", region: "asia-southeast1" },
  async (event) => {
    const before = event.data?.before, after = event.data?.after;
    const had = before?.exists, has = after?.exists;
    const db = admin.firestore();
    const postRef = db.collection("posts").doc(event.params.postId);
    const inc = admin.firestore.FieldValue.increment;
    if (!had && has) {
      const p = await postRef.get(); if (!p.exists) return;
      const type = after.data().type || "like";
      await postRef.update({ likes: inc(1), ["reactions." + type]: inc(1) });
      await awardOnce(db, event.params.postId, event.params.uid, "likeAwarded", p.data().authorId, PTS.perLike);
    } else if (had && !has) {
      const p = await postRef.get(); if (!p.exists) return;
      const type = before.data().type || "like";
      await postRef.update({ likes: inc(-1), ["reactions." + type]: inc(-1) });
    } else if (had && has) {
      const ot = before.data().type || "like", nt = after.data().type || "like";
      if (ot !== nt) {
        const p = await postRef.get(); if (!p.exists) return;
        await postRef.update({ ["reactions." + ot]: inc(-1), ["reactions." + nt]: inc(1) });
      }
    }
  }
);`;

const edits = [
  { name:'rules: เจ้าของแก้ type รีแอคชันได้', file:FR, done:'allow create, update, delete: if isOwner(uid);',
    OLD:`      match /likes/{uid} {
        allow read: if signedIn();
        allow create, delete: if isOwner(uid);
        allow update: if false;`,
    NEW:`      match /likes/{uid} {
        allow read: if signedIn();
        allow create, update, delete: if isOwner(uid);` },

  { name:'functions: onLikeWrite นับ reactions map', file:FN, done:'const inc = admin.firestore.FieldValue.increment;',
    OLD:`exports.onLikeWrite = onDocumentWritten(
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
);`, NEW:NEW_ONLIKE },

  { name:'client: ปุ่ม like → เปิด picker', file:IH, done:`onclick="toggleReactPicker(event,`,
    OLD:`        <button class="pa" onclick="likePost('\${id}',this)"><span class="pi">👍</span>ถูกใจ</button>`,
    NEW:`        <button class="pa" data-rx="" onclick="toggleReactPicker(event,'\${id}',this)"><span class="pi" id="rx-ico-\${id}">👍</span><span id="rx-lbl-\${id}">ถูกใจ</span></button>` },

  { name:'client: แสดงสรุปอีโมจิบนโพส', file:IH, done:'reactionEmojis(p)',
    OLD:`          <span id="likes-\${id}">\${p.likes || 0}</span>`,
    NEW:`          <span class="rx-emojis" style="margin-right:3px">\${reactionEmojis(p)}</span><span id="likes-\${id}">\${p.likes || 0}</span>` },

  { name:'client: ฟังก์ชัน reactions', file:IH, done:'function toggleReactPicker',
    OLD:`function escapeHtml(s) {`, NEW:REACT_JS + `function escapeHtml(s) {` },
];

let applied=0;
for(const e of edits){
  if(cnt(buf[e.file], e.done)>0){ console.log('• '+e.name+' — ทำไปแล้ว ข้าม'); e._skip=true; continue; }
  const n=cnt(buf[e.file], e.OLD);
  if(n!==1){ console.error('✗ '+e.name+' — anchor '+n+' ครั้ง (ต้อง 1)'); e._fail=true; continue; }
  buf[e.file]=buf[e.file].replace(e.OLD, e.NEW); applied++;
}
const bad = edits.filter(e=>e._fail || (!e._skip && cnt(buf[e.file],e.done)===0)).map(e=>e.name);
if(bad.length){ console.error('\n⛔ ไม่สำเร็จ — ไม่เขียนไฟล์:\n   - '+bad.join('\n   - ')); process.exit(1); }
if(applied===0){ console.log('\n✓ ทำครบแล้ว'); process.exit(0); }
fs.writeFileSync(FR,buf[FR]); fs.writeFileSync(FN,buf[FN]); fs.writeFileSync(IH,buf[IH]);
console.log('\n✓ เขียนเสร็จ: firestore.rules, functions/index.js, index.html ('+applied+' จุด)');
console.log('  ขั้นต่อไป:  firebase deploy --only firestore:rules,functions,hosting');
