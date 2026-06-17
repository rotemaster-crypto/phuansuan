// ============================================================
//  apply_leaderboard.js — เพื่อนสวน
//  แทนหน้าชุมชน (กลุ่มปลอม) ด้วย Leaderboard "ปราชญ์ชาวสวน" จริง
//  - ดึง users เรียงตามแต้ม (orderBy points desc, ไม่ต้องมี composite index)
//  - โหลดตอนเข้าแท็บชุมชน (hook switchScreen)
//  แตะ index.html ไฟล์เดียว, idempotent
// ============================================================
const fs = require('fs');
const IH = 'index.html';
if(!fs.existsSync(IH)){ console.error('✗ ไม่พบ '+IH+' — รันจาก root'); process.exit(1); }
let s = fs.readFileSync(IH,'utf8');
const cnt=(str,sub)=>str.split(sub).length-1;

const NEW_SCREEN = `<div class="screen" id="screen-community">
  <div style="padding:14px 16px 84px">
    <div style="font-size:20px;font-weight:800;color:var(--text)">🏆 ปราชญ์ชาวสวน</div>
    <div style="font-size:13px;color:var(--muted);margin:2px 0 14px">อันดับผู้สะสมแต้มสูงสุด — ยิ่งแบ่งปัน ยิ่งไต่อันดับ</div>
    <div id="leaderboard-list">
      <div style="text-align:center;color:var(--muted);padding:30px;font-size:14px">กำลังโหลด...</div>
    </div>
  </div>
</div>`;

const LB_JS = `// ── Leaderboard (ปราชญ์ชาวสวน) ───────────────────────────
async function loadLeaderboard() {
  var box = document.getElementById('leaderboard-list');
  if (!box || !db) return;
  box.innerHTML = '<div style="text-align:center;color:var(--muted);padding:30px;font-size:14px">กำลังโหลด...</div>';
  try {
    var snap = await db.collection('users').orderBy('points', 'desc').limit(30).get();
    var rows = [], rank = 0;
    snap.forEach(function (d) {
      var u = d.data(); rank++;
      var tiers = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.tiers) || {};
      var t = tiers[u.tier] || {};
      var medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : String(rank);
      var isMe = currentUser && d.id === currentUser.uid;
      var nm = escapeHtml(u.displayName || 'ชาวสวน');
      var av = u.photoUrl
        ? '<div style="width:40px;height:40px;border-radius:50%;background-image:url(' + u.photoUrl + ');background-size:cover;background-position:center;flex-shrink:0"></div>'
        : '<div style="width:40px;height:40px;border-radius:50%;background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;flex-shrink:0">' + (nm.charAt(0) || 'ช') + '</div>';
      rows.push(
        '<div style="display:flex;align-items:center;gap:12px;padding:11px 12px;border-radius:12px;margin-bottom:8px;background:' + (isMe ? '#eaf3ff' : '#fff') + ';border:1px solid var(--border)">'
        + '<div style="width:30px;text-align:center;font-weight:800;color:var(--muted);flex-shrink:0;font-size:' + (rank <= 3 ? '20px' : '15px') + '">' + medal + '</div>'
        + av
        + '<div style="flex:1;min-width:0"><div style="font-size:15px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + nm + (isMe ? ' <span style="color:var(--primary);font-size:12px">(คุณ)</span>' : '') + '</div>'
        + '<div style="font-size:12px;color:var(--muted)">' + (t.emoji || '🏅') + ' ' + (t.label || u.tier || '') + '</div></div>'
        + '<div style="text-align:right;flex-shrink:0"><div style="font-size:16px;font-weight:800;color:var(--primary)">' + (u.points || 0).toLocaleString() + '</div><div style="font-size:11px;color:var(--muted)">แต้ม</div></div>'
        + '</div>'
      );
    });
    box.innerHTML = rows.length ? rows.join('') : '<div style="text-align:center;color:var(--muted);padding:30px;font-size:14px">ยังไม่มีสมาชิก</div>';
  } catch (e) {
    console.error('leaderboard:', e);
    box.innerHTML = '<div style="text-align:center;color:var(--muted);padding:30px;font-size:14px">โหลดอันดับไม่สำเร็จ</div>';
  }
}

`;

const edits = [
  { name:'แทนหน้าชุมชน mock → Leaderboard', done:'id="leaderboard-list"',
    RE:/<div class="screen" id="screen-community">[\s\S]*?32 โพสวันนี้<\/span><\/div>\n    <\/div>\n  <\/div>\n<\/div>/,
    NEW:NEW_SCREEN },
  { name:'hook: โหลด leaderboard ตอนเข้าแท็บชุมชน', done:`name === 'community'){ loadLeaderboard()`,
    OLD:`  if(name === 'profile'){ renderProfileInfo(); loadMyPosts(); }`,
    NEW:`  if(name === 'profile'){ renderProfileInfo(); loadMyPosts(); }\n  if(name === 'community'){ loadLeaderboard(); }` },
  { name:'ฟังก์ชัน loadLeaderboard', done:'function loadLeaderboard',
    OLD:`function escapeHtml(s) {`, NEW:LB_JS + `function escapeHtml(s) {` },
];

let applied=0;
for(const e of edits){
  if(cnt(s, e.done)>0){ console.log('• '+e.name+' — ทำไปแล้ว ข้าม'); e._skip=true; continue; }
  if(e.RE){ if(!e.RE.test(s)){ console.error('✗ '+e.name+' — regex ไม่ตรง'); e._fail=true; continue; } s=s.replace(e.RE, e.NEW); applied++; }
  else { const n=cnt(s, e.OLD); if(n!==1){ console.error('✗ '+e.name+' — anchor '+n+' ครั้ง'); e._fail=true; continue; } s=s.replace(e.OLD, e.NEW); applied++; }
}
const bad = edits.filter(e=>e._fail || (!e._skip && cnt(s,e.done)===0)).map(e=>e.name);
if(bad.length){ console.error('\n⛔ ไม่สำเร็จ — ไม่เขียนไฟล์:\n   - '+bad.join('\n   - ')); process.exit(1); }
if(applied===0){ console.log('\n✓ ทำครบแล้ว'); process.exit(0); }
fs.writeFileSync(IH, s);
console.log('\n✓ เขียนเสร็จ: index.html ('+applied+' จุด)');
console.log('  ขั้นต่อไป:  firebase deploy --only hosting');
