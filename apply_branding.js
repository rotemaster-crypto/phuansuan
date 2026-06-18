// ============================================================
//  apply_branding.js — เพื่อนสวน (แผน A: ระบบแบรนด์ดิ้ง)
//  super admin แก้ ชื่อแอป/คำโปรย/อีโมจิ/สีหลัก/สีเสริม/หัวข้อ Leaderboard
//  จากแผง Admin → เซฟลง settings/{tenant}.branding → ทุกเครื่องเปลี่ยน real-time
//  แตะ index.html, idempotent (done sentinel)
// ============================================================
const fs = require('fs');
const IH = 'index.html';
if(!fs.existsSync(IH)){ console.error('✗ ไม่พบ '+IH); process.exit(1); }
let s = fs.readFileSync(IH,'utf8');
const cnt=(str,sub)=>str.split(sub).length-1;

const BRANDING_JS = `// ── Branding (super admin แก้ได้, real-time) ─────────────
function applyBranding(b) {
  if (!b) return;
  var C = APP_CONFIG;
  var name = b.appName || C.app.name;
  var emoji = b.logoEmoji || C.app.logoEmoji;
  var el = document.getElementById('app-logo');
  if (el) el.textContent = emoji + ' ' + name;
  document.title = name;
  if (b.primaryColor) document.documentElement.style.setProperty('--primary', b.primaryColor);
  if (b.accentColor) document.documentElement.style.setProperty('--accent', b.accentColor);
  var lt = document.getElementById('lb-title');
  if (lt && b.leaderboardTitle) lt.textContent = '🏆 ' + b.leaderboardTitle;
  var sub = document.getElementById('login-tagline');
  if (sub && b.subtitle) sub.textContent = b.subtitle;
  window._branding = b;
}

function renderAdminBranding() {
  var box = document.getElementById('admin-branding');
  if (!box || !isAdmin()) return;
  var b = window._branding || {};
  var C = APP_CONFIG;
  function esc(v){ return String(v || '').replace(/"/g, '&quot;'); }
  function row(label, id, val) {
    return '<div style="margin:8px 0"><div style="font-size:13px;color:#555;margin-bottom:3px">' + label + '</div>'
      + '<input id="' + id + '" type="text" value="' + esc(val) + '" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box"></div>';
  }
  box.innerHTML = '<div style="font-size:16px;font-weight:800;margin:16px 0 6px;border-top:1px solid #eee;padding-top:14px">🎨 แบรนด์</div>'
    + row('ชื่อแอป', 'br-name', b.appName || C.app.name)
    + row('คำโปรย', 'br-sub', b.subtitle || '')
    + row('อีโมจิโลโก้', 'br-emoji', b.logoEmoji || C.app.logoEmoji)
    + row('หัวข้อ Leaderboard', 'br-lb', b.leaderboardTitle || 'ปราชญ์ชาวสวน')
    + '<div style="display:flex;gap:18px;align-items:flex-end;margin:10px 0">'
    +   '<div><div style="font-size:13px;color:#555;margin-bottom:3px">สีหลัก</div><input id="br-primary" type="color" value="' + esc(b.primaryColor || C.app.primaryColor || '#1877f2') + '" style="width:48px;height:34px;padding:0;border:1px solid #ccc;border-radius:6px"></div>'
    +   '<div><div style="font-size:13px;color:#555;margin-bottom:3px">สีเสริม</div><input id="br-accent" type="color" value="' + esc(b.accentColor || C.app.accentColor || '#42b883') + '" style="width:48px;height:34px;padding:0;border:1px solid #ccc;border-radius:6px"></div>'
    + '</div>'
    + '<button onclick="saveBranding()" style="width:100%;margin-top:6px;padding:10px;background:var(--primary);color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer">บันทึกแบรนด์</button>';
}

async function saveBranding() {
  if (!isAdmin() || !db) return;
  function v(id){ var e = document.getElementById(id); return e ? e.value.trim() : ''; }
  var b = {
    appName: v('br-name'), subtitle: v('br-sub'), logoEmoji: v('br-emoji'),
    leaderboardTitle: v('br-lb'), primaryColor: v('br-primary'), accentColor: v('br-accent'),
  };
  applyBranding(b);
  try {
    await db.collection('settings').doc(tenantId()).set({ branding: b }, { merge: true });
    alert('บันทึกแบรนด์แล้ว ✓');
  } catch (e) { alert('บันทึกไม่ได้: ' + e.message); }
}

`;

const edits = [
  { name:'เพิ่ม --accent ใน :root', done:'--accent:#42b883',
    OLD:`:root{--primary:#1877f2;--bg:#f0f2f5;--card:#fff;--border:#e4e6eb;--text:#1c1e21;--muted:#65676b}`,
    NEW:`:root{--primary:#1877f2;--accent:#42b883;--bg:#f0f2f5;--card:#fff;--border:#e4e6eb;--text:#1c1e21;--muted:#65676b}` },

  { name:'id ให้หัวข้อ Leaderboard', done:'id="lb-title"',
    OLD:`    <div style="font-size:20px;font-weight:800;color:var(--text)">🏆 ปราชญ์ชาวสวน</div>`,
    NEW:`    <div id="lb-title" style="font-size:20px;font-weight:800;color:var(--text)">🏆 ปราชญ์ชาวสวน</div>` },

  { name:'init: apply --accent จาก config', done:`setProperty('--accent', C.app.accentColor)`,
    OLD:`  document.documentElement.style.setProperty('--primary', C.app.primaryColor);`,
    NEW:`  document.documentElement.style.setProperty('--primary', C.app.primaryColor);\n  if (C.app.accentColor) document.documentElement.style.setProperty('--accent', C.app.accentColor);` },

  { name:'listener settings: apply branding real-time', done:'if (d && d.branding) applyBranding(d.branding);',
    OLD:`      if (d && d.features) APP_CONFIG.features = Object.assign({}, APP_CONFIG.features, d.features);
      applyFeatureFlags();
      renderAdminToggles();`,
    NEW:`      if (d && d.features) APP_CONFIG.features = Object.assign({}, APP_CONFIG.features, d.features);
      if (d && d.branding) applyBranding(d.branding);
      applyFeatureFlags();
      renderAdminToggles();
      renderAdminBranding();` },

  { name:'admin modal: ช่องแบรนด์', done:'id="admin-branding"',
    OLD:`    + '<div id="admin-toggles"></div></div>';`,
    NEW:`    + '<div id="admin-toggles"></div>'\n    + '<div id="admin-branding"></div></div>';` },

  { name:'openAdminPanel: render branding', done:'renderAdminToggles(); renderAdminBranding(); }',
    OLD:`function openAdminPanel() { ensureAdminPanel(); const m = document.getElementById('admin-panel'); if (m) m.style.display = 'flex'; renderAdminToggles(); }`,
    NEW:`function openAdminPanel() { ensureAdminPanel(); const m = document.getElementById('admin-panel'); if (m) m.style.display = 'flex'; renderAdminToggles(); renderAdminBranding(); }` },

  { name:'ฟังก์ชัน branding', done:'function applyBranding',
    OLD:`function escapeHtml(s) {`, NEW:BRANDING_JS + `function escapeHtml(s) {` },
];

let applied=0;
for(const e of edits){
  if(cnt(s, e.done)>0){ console.log('• '+e.name+' — ทำไปแล้ว ข้าม'); e._skip=true; continue; }
  const n=cnt(s, e.OLD);
  if(n!==1){ console.error('✗ '+e.name+' — anchor '+n+' ครั้ง (ต้อง 1)'); e._fail=true; continue; }
  s=s.replace(e.OLD, e.NEW); applied++;
}
const bad = edits.filter(e=>e._fail || (!e._skip && cnt(s,e.done)===0)).map(e=>e.name);
if(bad.length){ console.error('\n⛔ ไม่สำเร็จ — ไม่เขียนไฟล์:\n   - '+bad.join('\n   - ')); process.exit(1); }
if(applied===0){ console.log('\n✓ ทำครบแล้ว'); process.exit(0); }
fs.writeFileSync(IH, s);
console.log('\n✓ เขียนเสร็จ: index.html ('+applied+' จุด)');
console.log('  ขั้นต่อไป:  firebase deploy --only hosting');
