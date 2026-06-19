// ============================================================
//  apply_branding_fix.js — เพื่อนสวน
//  ทำให้แอปหลักอ่าน branding จาก settings/app (ที่ admin.html เขียนจริง)
//  map: primary→สีหลัก, accent→สีเสริม, grad1/grad2→หน้าปก, appName/logo/subtitle
//  เพิ่ม listener real-time ตัวเดียวใน initFeatureFlags, idempotent
// ============================================================
const fs = require('fs');
const IH = 'index.html';
if(!fs.existsSync(IH)){ console.error('✗ ไม่พบ '+IH); process.exit(1); }
let s = fs.readFileSync(IH,'utf8');
const cnt=(str,sub)=>str.split(sub).length-1;

const done = `db.collection('settings').doc('app').onSnapshot(`;
const OLD = `    err => { console.warn('featureFlags:', err.message); }
  );
}`;
const NEW = `    err => { console.warn('featureFlags:', err.message); }
  );
  db.collection('settings').doc('app').onSnapshot(
    snap => {
      const d = snap.exists ? snap.data() : null;
      if (!d) return;
      applyBranding({
        appName: d.appName, subtitle: d.subtitle, logoEmoji: d.logoEmoji,
        primaryColor: d.primary, accentColor: d.accent,
      });
      if (d.grad1 || d.grad2) {
        const cov = document.getElementById('prof-cover');
        if (cov) cov.style.background = 'linear-gradient(160deg,' + (d.grad1 || '#1877f2') + ' 0%,' + (d.grad2 || '#42b883') + ' 100%)';
      }
    },
    err => { console.warn('appSettings:', err.message); }
  );
}`;

if(cnt(s, done)>0){ console.log('✓ ทำไปแล้ว'); process.exit(0); }
const n=cnt(s, OLD);
if(n!==1){ console.error('✗ anchor '+n+' ครั้ง (ต้อง 1)'); process.exit(1); }
s=s.replace(OLD, NEW);
if(cnt(s, done)===0){ console.error('✗ เขียนไม่สำเร็จ'); process.exit(1); }
fs.writeFileSync(IH, s);
console.log('✓ เขียนเสร็จ: index.html (1 จุด)');
console.log('  ขั้นต่อไป:  firebase deploy --only hosting');
