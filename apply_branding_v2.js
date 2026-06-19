// ============================================================
//  apply_branding_v2.js — เพื่อนสวน (ต่อยอดแบรนด์ดิ้ง)
//   - ชื่อ tier เป็นไทย (config) + แจ้งเตือนไทย (functions)
//   - super admin แก้ ชื่อ tier + ป้ายแท็บล่าง ได้จากแผง 🎨 แบรนด์
//  3 ไฟล์, idempotent
// ============================================================
const fs = require('fs');
const CF='config.js', FN='functions/index.js', IH='index.html';
for(const f of [CF,FN,IH]){ if(!fs.existsSync(f)){ console.error('✗ ไม่พบ '+f); process.exit(1); } }
const buf={ [CF]:fs.readFileSync(CF,'utf8'), [FN]:fs.readFileSync(FN,'utf8'), [IH]:fs.readFileSync(IH,'utf8') };
const cnt=(s,sub)=>s.split(sub).length-1;

const APPLY_EXTRA = `  if (b.tierLabels) {
    var TL = b.tierLabels;
    ['bronze','silver','gold','platinum'].forEach(function (k) {
      if (C.tiers && C.tiers[k] && TL[k]) C.tiers[k].label = TL[k];
      var sp = document.getElementById('tlb-' + k);
      if (sp && TL[k]) sp.textContent = TL[k];
    });
    if (document.getElementById('leaderboard-list') && typeof loadLeaderboard === 'function') loadLeaderboard();
  }
  if (b.navLabels) {
    ['feed','community','profile','shop'].forEach(function (k) {
      var nl = document.getElementById('nav-lbl-' + k);
      if (nl && b.navLabels[k]) nl.textContent = b.navLabels[k];
    });
  }
  window._branding = b;
}`;

const ADMIN_EXTRA = `    + '<div style="font-size:14px;font-weight:700;margin:14px 0 4px;color:#333">ชื่อระดับ (Tier)</div>'
    + row('ระดับ 1 (เริ่มต้น)', 'br-tier-bronze', (b.tierLabels && b.tierLabels.bronze) || C.tiers.bronze.label)
    + row('ระดับ 2', 'br-tier-silver', (b.tierLabels && b.tierLabels.silver) || C.tiers.silver.label)
    + row('ระดับ 3', 'br-tier-gold', (b.tierLabels && b.tierLabels.gold) || C.tiers.gold.label)
    + row('ระดับ 4 (สูงสุด)', 'br-tier-platinum', (b.tierLabels && b.tierLabels.platinum) || C.tiers.platinum.label)
    + '<div style="font-size:14px;font-weight:700;margin:14px 0 4px;color:#333">ป้ายแท็บล่าง</div>'
    + row('แท็บ 1', 'br-nav-feed', (b.navLabels && b.navLabels.feed) || 'หน้าหลัก')
    + row('แท็บ 2', 'br-nav-community', (b.navLabels && b.navLabels.community) || 'ชุมชน')
    + row('แท็บ 3', 'br-nav-profile', (b.navLabels && b.navLabels.profile) || 'โปรไฟล์')
    + row('แท็บ 4', 'br-nav-shop', (b.navLabels && b.navLabels.shop) || 'ร้านค้า')
    + '<button onclick="saveBranding()" style="width:100%;margin-top:6px;padding:10px;background:var(--primary);color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer">บันทึกแบรนด์</button>';`;

const edits = [
  { name:'config tier: Bronze→มือใหม่', file:CF, done:`label: 'มือใหม่'`, OLD:`label: 'Bronze'`, NEW:`label: 'มือใหม่'` },
  { name:'config tier: Silver→เงิน',   file:CF, done:`label: 'เงิน'`,   OLD:`label: 'Silver'`, NEW:`label: 'เงิน'` },
  { name:'config tier: Gold→ทอง',      file:CF, done:`label: 'ทอง'`,    OLD:`label: 'Gold'`,   NEW:`label: 'ทอง'` },
  { name:'config tier: Platinum→ปราชญ์', file:CF, done:`label: 'ปราชญ์'`, OLD:`label: 'Platinum'`, NEW:`label: 'ปราชญ์'` },

  { name:'functions: ชื่อ tier ไทยในแจ้งเตือน', file:FN, done:`bronze:"มือใหม่"`,
    OLD:`const label={bronze:"Bronze",silver:"Silver",gold:"Gold",platinum:"Platinum"};`,
    NEW:`const label={bronze:"มือใหม่",silver:"เงิน",gold:"ทอง",platinum:"ปราชญ์"};` },

  { name:'nav id: feed', file:IH, done:'id="nav-lbl-feed"',
    OLD:`    <div class="bn-ico">🏠</div>\n    <div class="bn-lbl">หน้าหลัก</div>`,
    NEW:`    <div class="bn-ico">🏠</div>\n    <div class="bn-lbl" id="nav-lbl-feed">หน้าหลัก</div>` },
  { name:'nav id: community', file:IH, done:'id="nav-lbl-community"',
    OLD:`    <div class="bn-ico">👥</div>\n    <div class="bn-lbl">ชุมชน</div>`,
    NEW:`    <div class="bn-ico">👥</div>\n    <div class="bn-lbl" id="nav-lbl-community">ชุมชน</div>` },
  { name:'nav id: profile', file:IH, done:'id="nav-lbl-profile"',
    OLD:`    <div class="bn-ico">👤</div>\n    <div class="bn-lbl">โปรไฟล์</div>`,
    NEW:`    <div class="bn-ico">👤</div>\n    <div class="bn-lbl" id="nav-lbl-profile">โปรไฟล์</div>` },
  { name:'nav id: shop', file:IH, done:'id="nav-lbl-shop"',
    OLD:`    <div class="bn-ico">🛒</div>\n    <div class="bn-lbl">ร้านค้า</div>`,
    NEW:`    <div class="bn-ico">🛒</div>\n    <div class="bn-lbl" id="nav-lbl-shop">ร้านค้า</div>` },

  { name:'tier bar: ไทย+id', file:IH, done:'id="tlb-bronze"',
    OLD:`    <div class="tier-lbs"><span>Bronze</span><span>Silver</span><span id="tier-label" class="tier-act">Bronze</span><span>Platinum</span></div>`,
    NEW:`    <div class="tier-lbs"><span id="tlb-bronze">มือใหม่</span><span id="tlb-silver">เงิน</span><span id="tier-label" class="tier-act">มือใหม่</span><span id="tlb-platinum">ปราชญ์</span></div>` },

  { name:'applyBranding: tier+nav', file:IH, done:'if (b.tierLabels) {',
    OLD:`  window._branding = b;\n}`, NEW:APPLY_EXTRA },

  { name:'renderAdminBranding: ช่อง tier+nav', file:IH, done:`'br-tier-bronze'`,
    OLD:`    + '<button onclick="saveBranding()" style="width:100%;margin-top:6px;padding:10px;background:var(--primary);color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer">บันทึกแบรนด์</button>';`,
    NEW:ADMIN_EXTRA },

  { name:'saveBranding: เก็บ tier+nav', file:IH, done:'tierLabels: {',
    OLD:`    leaderboardTitle: v('br-lb'), primaryColor: v('br-primary'), accentColor: v('br-accent'),\n  };`,
    NEW:`    leaderboardTitle: v('br-lb'), primaryColor: v('br-primary'), accentColor: v('br-accent'),\n    tierLabels: { bronze: v('br-tier-bronze'), silver: v('br-tier-silver'), gold: v('br-tier-gold'), platinum: v('br-tier-platinum') },\n    navLabels: { feed: v('br-nav-feed'), community: v('br-nav-community'), profile: v('br-nav-profile'), shop: v('br-nav-shop') },\n  };` },
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
fs.writeFileSync(CF,buf[CF]); fs.writeFileSync(FN,buf[FN]); fs.writeFileSync(IH,buf[IH]);
console.log('\n✓ เขียนเสร็จ: config.js, functions/index.js, index.html ('+applied+' จุด)');
console.log('  ขั้นต่อไป:  firebase deploy --only functions,hosting');
