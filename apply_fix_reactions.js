#!/usr/bin/env node
/* งานค้าง #2 — รีแอคชัน: จำสถานะตอนรีโหลด + ยอด/อีโมจิคนอื่น real-time
 * index.html ล้วน:
 *  - renderPost: ใส่ id ปุ่ม (rx-btn) + emoji summary (rxe)
 *  - hydrateMyReactions: โหลด likes/{uid} ของเราแล้ว set ปุ่มตอนโหลด
 *  - subscribePostStats: per-post onSnapshot อัปเดต likes count + emoji แบบ real-time
 * idempotent · ไม่แตะ rules
 */
'use strict';
const fs = require('fs');
const NL = String.fromCharCode(10);
let CHANGED = false;
function die(m){ console.error('❌ '+m); process.exit(1); }
function read(p){ if(!fs.existsSync(p)) die('ไม่พบไฟล์: '+p); return fs.readFileSync(p,'utf8'); }
function cnt(s,sub){ return s.split(sub).length-1; }
function replaceOnce(file, src, OLD, NEW, done){
  if (src.indexOf(done) !== -1){ console.log('  • ข้าม (ทำแล้ว): '+done.slice(0,42)); return src; }
  const n = cnt(src, OLD);
  if (n !== 1) die(file+': anchor พบ '+n+' จุด (ต้อง 1): '+OLD.slice(0,55).replace(/\n/g,'⏎'));
  CHANGED = true; return src.replace(OLD, NEW);
}

const IDX = 'index.html';
let idx = read(IDX);

// R1: ใส่ id ให้ emoji summary span
idx = replaceOnce(IDX, idx,
  '          <span class="rx-emojis" style="margin-right:3px">${reactionEmojis(p)}</span><span id="likes-${id}">${p.likes || 0}</span>',
  '          <span class="rx-emojis" id="rxe-${id}" style="margin-right:3px">${reactionEmojis(p)}</span><span id="likes-${id}">${p.likes || 0}</span>',
  'id="rxe-${id}"');

// R2: ใส่ id ให้ปุ่มรีแอค
idx = replaceOnce(IDX, idx,
  '        <button class="pa" data-rx="" onclick="toggleReactPicker(event,\'${id}\',this)"><span class="pi" id="rx-ico-${id}">👍</span><span id="rx-lbl-${id}">ถูกใจ</span></button>',
  '        <button class="pa" id="rx-btn-${id}" data-rx="" onclick="toggleReactPicker(event,\'${id}\',this)"><span class="pi" id="rx-ico-${id}">👍</span><span id="rx-lbl-${id}">ถูกใจ</span></button>',
  'id="rx-btn-${id}"');

// R3: เพิ่มฟังก์ชัน hydrate + real-time (ก่อน escapeHtml)
const R3_OLD = 'function escapeHtml(s) {';
const R3_NEW = [
'var _postUnsubs = [];',
'function hydrateMyReactions(ids){',
"  if (!currentUser || !db || (typeof isGuest === 'function' && isGuest())) return;",
'  ids.forEach(function(id){',
"    db.collection('posts').doc(id).collection('likes').doc(currentUser.uid).get().then(function(d){",
'      if (!d.exists) return;',
"      var btn = document.getElementById('rx-btn-' + id);",
'      if (!btn) return;',
'      var t = (d.data() || {}).type;',
'      if (!t && REACTIONS[0]) t = REACTIONS[0].key;',
'      setReactBtn(btn, id, t);',
'    }).catch(function(){});',
'  });',
'}',
'function updatePostStats(id, data){',
'  if (!data) return;',
"  var el = document.getElementById('likes-' + id);",
'  if (el) el.textContent = data.likes || 0;',
"  var rxe = document.getElementById('rxe-' + id);",
'  if (rxe) rxe.textContent = reactionEmojis(data);',
"  var cc = document.querySelector('[onclick=\"toggleComments(\\'cmt-' + id + '\\')\"]');",
'  if (cc) cc.textContent = "ความคิดเห็น " + (data.comments || 0);',
'}',
'function subscribePostStats(ids){',
'  _postUnsubs.forEach(function(u){ try { u(); } catch(e){} });',
'  _postUnsubs = [];',
'  if (!db) return;',
'  ids.forEach(function(id){',
"    var un = db.collection('posts').doc(id).onSnapshot(function(snap){",
'      if (snap.exists) updatePostStats(id, snap.data());',
'    }, function(){});',
'    _postUnsubs.push(un);',
'  });',
'}',
'function escapeHtml(s) {'
].join(NL);
idx = replaceOnce(IDX, idx, R3_OLD, R3_NEW, 'function subscribePostStats(ids){');

// R4: เรียก hydrate + subscribe หลัง render feed
idx = replaceOnce(IDX, idx,
  '    populateRelatedProducts(docs);',
  ['    populateRelatedProducts(docs);',
   '    var _ids = docs.map(function(d){ return d.id; });',
   '    hydrateMyReactions(_ids);',
   '    subscribePostStats(_ids);'].join(NL),
  'hydrateMyReactions(_ids);');

fs.writeFileSync(IDX, idx);
console.log(CHANGED ? '✅ patch งานค้าง #2 (reaction) สำเร็จ' : '✅ ไม่มีอะไรเปลี่ยน (idempotent)');
