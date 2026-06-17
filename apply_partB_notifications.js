// ============================================================
//  apply_partB_notifications.js — เพื่อนสวน (Part B)
//  ต่อ 🔔 แจ้งเตือนให้ทำงานจริง:
//   - firestore.rules: อ่าน notif ของตัวเองได้ + mark read (server เป็นคนสร้าง)
//   - index.html: ปุ่ม bell จริง + แผงแจ้งเตือน + badge นับ unread (realtime, sort client)
//  idempotent: เช็ค sentinel 'done' ถ้ามีแล้ว = ทำไปแล้ว ข้าม
// ============================================================
const fs = require('fs');
const FR='firestore.rules', IH='index.html';
for(const f of [FR,IH]){ if(!fs.existsSync(f)){ console.error('✗ ไม่พบ '+f+' — รันจาก root ของ repo'); process.exit(1); } }
const buf = { [FR]:fs.readFileSync(FR,'utf8'), [IH]:fs.readFileSync(IH,'utf8') };
const cnt=(s,sub)=>s.split(sub).length-1;

const NOTIF_JS = `// ── Notifications (Part B) ───────────────────────────────
let notifItems = [];
let notifStarted = false;
const NOTIF_ICON = { comment:'💬', help:'🤝', tier:'🏅', bell:'🔔', order:'📦' };

function startNotifs() {
  if (notifStarted || !db || !currentUser) return;
  notifStarted = true;
  db.collection('notifications')
    .where('uid', '==', currentUser.uid)
    .limit(50)
    .onSnapshot(function (snap) {
      notifItems = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
      notifItems.sort(function (a, b) {
        var ta = a.createdAt && a.createdAt.seconds ? a.createdAt.seconds : 0;
        var tb = b.createdAt && b.createdAt.seconds ? b.createdAt.seconds : 0;
        return tb - ta;
      });
      renderNotifBadge();
      var m = document.getElementById('notifModal');
      if (m && m.classList.contains('open')) renderNotifList();
    }, function (err) { console.error('notif listen:', err); notifStarted = false; });
}

function renderNotifBadge() {
  var n = notifItems.filter(function (x) { return !x.read; }).length;
  var b = document.getElementById('notif-badge');
  if (!b) return;
  if (n > 0) { b.textContent = n > 99 ? '99+' : n; b.style.display = ''; }
  else b.style.display = 'none';
}

function notifAgo(ts) {
  if (!ts || !ts.seconds) return '';
  var diff = Math.floor(Date.now() / 1000 - ts.seconds);
  if (diff < 60) return 'เมื่อสักครู่';
  if (diff < 3600) return Math.floor(diff / 60) + ' นาทีที่แล้ว';
  if (diff < 86400) return Math.floor(diff / 3600) + ' ชม.ที่แล้ว';
  if (diff < 604800) return Math.floor(diff / 86400) + ' วันที่แล้ว';
  return new Date(ts.seconds * 1000).toLocaleDateString('th-TH');
}

function renderNotifList() {
  var box = document.getElementById('notif-list');
  if (!box) return;
  if (!notifItems.length) {
    box.innerHTML = '<div style="text-align:center;color:var(--muted);padding:24px;font-size:14px">ยังไม่มีการแจ้งเตือน</div>';
    return;
  }
  box.innerHTML = notifItems.map(function (x) {
    var ic = NOTIF_ICON[x.icon] || '🔔';
    var bg = x.read ? '#fff' : '#eaf3ff';
    return '<div style="display:flex;gap:10px;align-items:flex-start;padding:11px 16px;background:' + bg + ';border-bottom:1px solid var(--border)">'
      + '<div style="font-size:20px;flex-shrink:0">' + ic + '</div>'
      + '<div style="flex:1;min-width:0">'
      + '<div style="font-size:14px;color:var(--text);line-height:1.4">' + escapeHtml(x.text || '') + '</div>'
      + '<div style="font-size:12px;color:var(--muted);margin-top:2px">' + notifAgo(x.createdAt) + '</div>'
      + '</div></div>';
  }).join('');
}

async function openNotifs() {
  var m = document.getElementById('notifModal');
  if (m) m.classList.add('open');
  renderNotifList();
  var unread = notifItems.filter(function (x) { return !x.read; });
  if (db && unread.length) {
    var batch = db.batch();
    unread.forEach(function (x) { batch.update(db.collection('notifications').doc(x.id), { read: true }); });
    try { await batch.commit(); } catch (e) { console.error('mark read:', e); }
  }
}
function closeNotifs() { var m = document.getElementById('notifModal'); if (m) m.classList.remove('open'); }

`;

const NOTIF_MODAL = `<!-- ══ NOTIFICATIONS ══ -->
<div class="overlay" id="notifModal" onclick="if(event.target===this)closeNotifs()">
  <div class="modal" style="border-radius:16px 16px 0 0;max-height:80vh">
    <div class="modal-top">
      <button class="modal-close" onclick="closeNotifs()">✕</button>
      <div class="modal-title">การแจ้งเตือน</div>
      <span style="width:34px"></span>
    </div>
    <div class="modal-body" id="notif-list" style="padding:8px 0 16px">
      <div style="text-align:center;color:var(--muted);padding:24px;font-size:14px">ยังไม่มีการแจ้งเตือน</div>
    </div>
  </div>
</div>

<div class="bottom-nav">`;

const edits = [
  { name:'rules: notifications (อ่าน/mark-read ของตัวเอง)', file:FR, done:'match /notifications/{nid}',
    OLD:`    match /{document=**} {
      allow read, write: if false;
    }`,
    NEW:`    // ── Notifications (อ่าน/mark-read เฉพาะของตัวเอง; server สร้าง) ──
    match /notifications/{nid} {
      allow read: if signedIn() && resource.data.uid == request.auth.uid;
      allow update: if signedIn() && resource.data.uid == request.auth.uid
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['read']);
      allow create, delete: if false;
    }

    match /{document=**} {
      allow read, write: if false;
    }` },

  { name:'index: ปุ่ม bell จริง + badge id', file:IH, done:'onclick="openNotifs()"',
    OLD:`  <button class="tb-btn">🔔<span class="tb-badge">3</span></button>`,
    NEW:`  <button class="tb-btn" onclick="openNotifs()">🔔<span class="tb-badge" id="notif-badge" style="display:none">0</span></button>` },

  { name:'index: แผงแจ้งเตือน (modal)', file:IH, done:'id="notifModal"',
    OLD:`<div class="bottom-nav">`, NEW:NOTIF_MODAL },

  { name:'index: เรียก startNotifs หลัง login', file:IH, done:'startNotifs();',
    OLD:`  try { ensureAdminPanel(); initFeatureFlags(); } catch (e) {}`,
    NEW:`  try { ensureAdminPanel(); initFeatureFlags(); } catch (e) {}\n  try { startNotifs(); } catch (e) {}` },

  { name:'index: ฟังก์ชัน notifications', file:IH, done:'function startNotifs()',
    OLD:`function escapeHtml(s) {`, NEW:NOTIF_JS + `function escapeHtml(s) {` },
];

let applied=0;
for(const e of edits){
  if(cnt(buf[e.file], e.done)>0){ console.log('• '+e.name+' — ทำไปแล้ว ข้าม'); e._skip=true; continue; }
  const n=cnt(buf[e.file], e.OLD);
  if(n!==1){ console.error('✗ '+e.name+' — anchor เจอ '+n+' ครั้ง (ต้อง 1)'); e._fail=true; continue; }
  buf[e.file]=buf[e.file].replace(e.OLD, e.NEW);
  applied++;
}
const fails = edits.filter(e=>e._fail).map(e=>e.name);
const notdone = edits.filter(e=>!e._skip && !e._fail && cnt(buf[e.file], e.done)===0).map(e=>e.name);
if(fails.length || notdone.length){
  console.error('\n⛔ ไม่สำเร็จ — ไม่เขียนไฟล์:');
  fails.concat(notdone).forEach(n=>console.error('   - '+n));
  process.exit(1);
}
if(applied===0){ console.log('\n✓ ทำครบแล้ว ไม่มีอะไรต้องทำ'); process.exit(0); }
fs.writeFileSync(FR, buf[FR]); fs.writeFileSync(IH, buf[IH]);
console.log('\n✓ เขียนเสร็จ: firestore.rules, index.html ('+applied+' จุด)');
console.log('  ขั้นต่อไป:  firebase deploy --only firestore:rules,hosting');
