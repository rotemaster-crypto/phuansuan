// Theme presets — shared by index.html + admin.html (+ bocean.html)
window.DEFAULT_THEME = 'classic';
window.THEME_PRESETS = {
  classic:  { label:'คลาสสิก (ฟ้า)',       primary:'#1877f2', accent:'#42b883', bg:'#f0f2f5', card:'#ffffff', border:'#e4e6eb', text:'#1c1e21', muted:'#65676b', onPrimary:'#ffffff' },
  airbnb:   { label:'ปะการัง (Airbnb)',     primary:'#ff385c', accent:'#ff385c', bg:'#ffffff', card:'#ffffff', border:'#dddddd', text:'#222222', muted:'#717171', onPrimary:'#ffffff' },
  intercom: { label:'ครีม (Intercom)',      primary:'#1a1a1a', accent:'#ff5600', bg:'#f5f1ec', card:'#ffffff', border:'#d3cec6', text:'#111111', muted:'#6b6b6b', onPrimary:'#ffffff' },
  voltage:  { label:'ดำ-เหลือง (Voltage)',   primary:'#faff69', accent:'#22c55e', bg:'#0a0a0a', card:'#1a1a1a', border:'#2a2a2a', text:'#ffffff', muted:'#888888', onPrimary:'#0a0a0a' }
};
window.applyTheme = function(id){
  var t = window.THEME_PRESETS[id] || window.THEME_PRESETS[window.DEFAULT_THEME];
  if (!t) return;
  var r = document.documentElement.style;
  r.setProperty('--primary', t.primary);
  r.setProperty('--accent', t.accent);
  r.setProperty('--bg', t.bg);
  r.setProperty('--card', t.card);
  r.setProperty('--border', t.border);
  r.setProperty('--text', t.text);
  r.setProperty('--muted', t.muted);
  r.setProperty('--on-primary', t.onPrimary);
};
