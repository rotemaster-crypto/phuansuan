// ============================================================
//  apply_wire_features.js — เพื่อนสวน (P1)
//   1) แอปหลักอ่าน Features จาก settings/features (admin.html เขียน) real-time
//   2) ลบ 🎨 แบรนด์ ที่ซ้ำในปุ่ม ⚙️ ของแอปหลัก (เหลือ admin.html ที่เดียว)
//      - คง applyBranding ไว้ (listener settings/app ใช้)
//  index.html ล้วน, idempotent (done=ต้องมี / gone=ต้องหาย)
// ============================================================
const fs = require('fs');
const IH = 'index.html';
if(!fs.existsSync(IH)){ console.error('✗ ไม่พบ '+IH); process.exit(1); }
let s = fs.readFileSync(IH,'utf8');
const cnt=(str,sub)=>str.split(sub).length-1;
const NL = String.fromCharCode(10);

const edits = [
  { name:'อ่าน Features จาก settings/features', done:`doc('features').onSnapshot(`,
    OLD:`  _ffInit = true;`,
    NEW:[`  _ffInit = true;`,
      `  db.collection('settings').doc('features').onSnapshot(`,
      `    snap => { const d = snap.exists ? snap.data() : null; if (d) { APP_CONFIG.features = Object.assign({}, APP_CONFIG.features, d); applyFeatureFlags(); renderAdminToggles(); } },`,
      `    err => { console.warn('featuresDoc:', err.message); }`,
      `  );`].join(NL) },

  { name:'ลบช่อง 🎨 ในแผง ⚙️ (slot)', gone:`<div id="admin-branding">`,
    OLD:`    + '<div id="admin-branding"></div></div>';`,
    NEW:`    + '</div>';` },

  { name:'เอา call renderAdminBranding ออกจาก openAdminPanel', gone:'renderAdminToggles(); renderAdminBranding(); }',
    OLD:`renderAdminToggles(); renderAdminBranding(); }`,
    NEW:`renderAdminToggles(); }` },

  { name:'เอา call renderAdminBranding ออกจาก listener', gone:`renderAdminToggles();${NL}      renderAdminBranding();`,
    OLD:[`      applyFeatureFlags();`,`      renderAdminToggles();`,`      renderAdminBranding();`].join(NL),
    NEW:[`      applyFeatureFlags();`,`      renderAdminToggles();`].join(NL) },
];

let applied=0;
for(const e of edits){
  const already = e.gone ? cnt(s,e.gone)===0 : cnt(s,e.done)>0;
  if(already){ console.log('• '+e.name+' — ทำไปแล้ว ข้าม'); e._skip=true; continue; }
  const n=cnt(s, e.OLD);
  if(n!==1){ console.error('✗ '+e.name+' — anchor '+n+' ครั้ง (ต้อง 1)'); e._fail=true; continue; }
  s=s.replace(e.OLD, e.NEW); applied++;
}
const bad = edits.filter(e=> e._fail || (!e._skip && (e.gone ? cnt(s,e.gone)!==0 : cnt(s,e.done)===0))).map(e=>e.name);
if(bad.length){ console.error(NL+'⛔ ไม่สำเร็จ — ไม่เขียนไฟล์:'+NL+'   - '+bad.join(NL+'   - ')); process.exit(1); }
if(applied===0){ console.log(NL+'✓ ทำครบแล้ว'); process.exit(0); }
fs.writeFileSync(IH, s);
console.log(NL+'✓ เขียนเสร็จ: index.html ('+applied+' จุด)');
console.log('  ขั้นต่อไป:  firebase deploy --only hosting');
