#!/usr/bin/env node
/* P2 — Points & Tier: อ่าน settings/points ทั้ง client + functions ให้เลขตรงกัน
 * idempotent: เช็ค anchor → เขียน → ยืนยัน done sentinel มี, ถ้าพลาด exit error
 */
'use strict';
const fs = require('fs');
const NL = String.fromCharCode(10);
let CHANGED = false;
function die(msg){ console.error('❌ ' + msg); process.exit(1); }
function read(p){ if(!fs.existsSync(p)) die('ไม่พบไฟล์: '+p); return fs.readFileSync(p,'utf8'); }
function countOf(s, sub){ return s.split(sub).length - 1; }

// ── helper แทนข้อความ (idempotent) ──
function replaceOnce(file, src, OLD, NEW, doneSentinel){
  if (src.indexOf(doneSentinel) !== -1) { console.log('  • ข้าม (ทำแล้ว): '+doneSentinel.slice(0,40)); return src; }
  const n = countOf(src, OLD);
  if (n !== 1) die(file+': anchor พบ '+n+' จุด (ต้องมี 1): '+OLD.slice(0,60).replace(/\n/g,'⏎'));
  CHANGED = true;
  return src.replace(OLD, NEW);
}

/* ============================================================
 * PART A — functions/index.js
 * ============================================================ */
const FN = 'functions/index.js';
let fn = read(FN);

// A1: เพิ่ม getPts(db) + เปลี่ยน calcTier/updateTier ให้อ่าน tier จาก settings
const A1_OLD = [
'function calcTier(pts) {',
'  for (const t of TIERS) { if (pts >= t.min) return t.key; }',
'  return "bronze";',
'}',
'async function updateTier(userRef) {',
'  const snap = await userRef.get();',
'  const pts = snap.data()?.points || 0;',
'  const newTier = calcTier(pts);',
'  if (snap.data()?.tier !== newTier) await userRef.update({ tier: newTier });',
'}'
].join(NL);

const A1_NEW = [
'// P2: อ่านแต้ม/tier จาก settings/points (cache 60 วิ) + fallback PTS/TIERS',
'let _ptsCache = null, _ptsAt = 0;',
'function _num(v, fb){',
'  if (typeof v === "number" && !isNaN(v)) return v;',
'  if (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v))) return Number(v);',
'  return fb;',
'}',
'async function getPts(db) {',
'  const now = Date.now();',
'  if (_ptsCache && (now - _ptsAt) < 60000) return _ptsCache;',
'  let d = {};',
'  try { const s = await db.collection("settings").doc("points").get(); if (s.exists) d = s.data() || {}; }',
'  catch (e) { /* ใช้ fallback */ }',
'  const P = {',
'    perPost:        _num(d.perPost,        PTS.perPost),',
'    perPostWithImg: _num(d.perPostWithImg, PTS.perPostWithImg),',
'    perComment:     _num(d.perComment,     PTS.perComment),',
'    perHelp:        _num(d.perHelp,        PTS.perHelp),',
'    perLike:        _num(d.perLike,        PTS.perLike),',
'    tiers: [',
'      { key: "platinum", min: _num(d.tierPlatinum, 6000) },',
'      { key: "gold",     min: _num(d.tierGold,     3000) },',
'      { key: "silver",   min: _num(d.tierSilver,   1000) },',
'      { key: "bronze",   min: 0 },',
'    ],',
'  };',
'  _ptsCache = P; _ptsAt = now; return P;',
'}',
'function calcTier(pts, tiers) {',
'  const list = tiers || TIERS;',
'  for (const t of list) { if (pts >= t.min) return t.key; }',
'  return "bronze";',
'}',
'async function updateTier(userRef, db) {',
'  const _db = db || admin.firestore();',
'  const P = await getPts(_db);',
'  const snap = await userRef.get();',
'  const pts = snap.data()?.points || 0;',
'  const newTier = calcTier(pts, P.tiers);',
'  if (snap.data()?.tier !== newTier) await userRef.update({ tier: newTier });',
'}'
].join(NL);

fn = replaceOnce(FN, fn, A1_OLD, A1_NEW, 'async function getPts(db) {');

// A2: onPostCreated → ใช้ getPts
const A2_OLD = '    const pts = post.imageUrl ? PTS.perPostWithImg : PTS.perPost;';
const A2_NEW = [
'    const P = await getPts(admin.firestore());',
'    const pts = post.imageUrl ? P.perPostWithImg : P.perPost;'
].join(NL);
fn = replaceOnce(FN, fn, A2_OLD, A2_NEW, 'const P = await getPts(admin.firestore());');

// A3: onCommentCreated → ใช้ getPts(db)
const A3_OLD = '    await ref.update({ points: admin.firestore.FieldValue.increment(PTS.perComment) });';
const A3_NEW = [
'    const P = await getPts(db);',
'    await ref.update({ points: admin.firestore.FieldValue.increment(P.perComment) });'
].join(NL);
fn = replaceOnce(FN, fn, A3_OLD, A3_NEW, 'increment(P.perComment)');

// A4: onLikeWrite → ใช้ getPts(db)
const A4_OLD = '      await awardOnce(db, event.params.postId, event.params.uid, "likeAwarded", p.data().authorId, PTS.perLike);';
const A4_NEW = [
'      const P = await getPts(db);',
'      await awardOnce(db, event.params.postId, event.params.uid, "likeAwarded", p.data().authorId, P.perLike);'
].join(NL);
fn = replaceOnce(FN, fn, A4_OLD, A4_NEW, 'p.data().authorId, P.perLike)');

// A5: onHelpWrite → ใช้ getPts(db)
const A5_OLD = '      await awardOnce(db, event.params.postId, event.params.uid, "helpAwarded", p.data().authorId, PTS.perHelp, { helpCount: admin.firestore.FieldValue.increment(1) });';
const A5_NEW = [
'      const P = await getPts(db);',
'      await awardOnce(db, event.params.postId, event.params.uid, "helpAwarded", p.data().authorId, P.perHelp, { helpCount: admin.firestore.FieldValue.increment(1) });'
].join(NL);
fn = replaceOnce(FN, fn, A5_OLD, A5_NEW, 'p.data().authorId, P.perHelp,');

fs.writeFileSync(FN, fn);

/* ============================================================
 * PART B — index.html (client)
 * ============================================================ */
const IDX = 'index.html';
let idx = read(IDX);

// B1: เพิ่ม applyPoints() + listener settings/points ใน initFeatureFlags
//     แทรกก่อนปิด initFeatureFlags (หลัง block settings/app)
const B1_OLD = [
"    err => { console.warn('appSettings:', err.message); }",
"  );",
"}"
].join(NL);

const B1_NEW = [
"    err => { console.warn('appSettings:', err.message); }",
"  );",
"  // P2: settings/points → APP_CONFIG.points + tier min/discount (real-time)",
"  db.collection('settings').doc('points').onSnapshot(",
"    snap => { const d = snap.exists ? snap.data() : null; if (d) applyPoints(d); },",
"    err => { console.warn('pointsSettings:', err.message); }",
"  );",
"}",
"function _pnum(v, fb) {",
"  if (typeof v === 'number' && !isNaN(v)) return v;",
"  if (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))) return Number(v);",
"  return fb;",
"}",
"function applyPoints(d) {",
"  const P = APP_CONFIG.points || (APP_CONFIG.points = {});",
"  ['perPost','perPostWithImg','perComment','perHelp','perLike','perPurchase','perAlert','perVerified','dailyLoginBonus']",
"    .forEach(k => { if (d[k] !== undefined) P[k] = _pnum(d[k], P[k]); });",
"  const T = APP_CONFIG.tiers; if (T) {",
"    if (T.silver)   T.silver.min   = _pnum(d.tierSilver,   T.silver.min);",
"    if (T.gold)     T.gold.min     = _pnum(d.tierGold,     T.gold.min);",
"    if (T.platinum) T.platinum.min = _pnum(d.tierPlatinum, T.platinum.min);",
"    if (T.silver)   T.silver.discount   = _pnum(d.discSilver,   T.silver.discount);",
"    if (T.gold)     T.gold.discount     = _pnum(d.discGold,     T.gold.discount);",
"    if (T.platinum) T.platinum.discount = _pnum(d.discPlatinum, T.platinum.discount);",
"    if (T.bronze && T.silver)   T.bronze.max = T.silver.min - 1;",
"    if (T.silver && T.gold)     T.silver.max = T.gold.min - 1;",
"    if (T.gold && T.platinum)   T.gold.max   = T.platinum.min - 1;",
"  }",
"  try { if (typeof currentUser !== 'undefined' && currentUser) updateUIWithUser(currentUser); } catch (e) {}",
"}"
].join(NL);

idx = replaceOnce(IDX, idx, B1_OLD, B1_NEW, 'function applyPoints(d) {');

fs.writeFileSync(IDX, idx);

console.log(CHANGED ? '✅ patch P2 สำเร็จ' : '✅ ไม่มีอะไรเปลี่ยน (idempotent — ทำไปแล้ว)');
