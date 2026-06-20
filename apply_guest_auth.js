#!/usr/bin/env node
/* #3 — เข้าดูไม่ต้อง login (guest) / จะโพส-คอมเมนต์-ไลก์-สั่งซื้อ-AI ต้อง login LINE
 * index.html ล้วน: init guest + isGuest/requireLogin + modal เชิญ login + gate 6 จุด
 * idempotent · ไม่แตะ rules (anonymous = signedIn อ่าน feed/ร้านได้อยู่แล้ว)
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

// G1: init — แทน showLoginScreen ด้วย guest anonymous
const G1_OLD = [
'    if (!liff.isLoggedIn()) {',
'      // ยังไม่ login → แสดงหน้า login',
'      hideLoading();',
'      showLoginScreen();',
'    } else {'
].join(NL);
const G1_NEW = [
'    if (!liff.isLoggedIn()) {',
'      // เข้าแบบ guest — ดู feed/ร้านได้ ไม่ต้อง login (จะโพส/สั่งซื้อค่อย login)',
'      await firebase.auth().signInAnonymously();',
'      const gu = firebase.auth().currentUser;',
"      currentUser = { uid: gu.uid, displayName: 'ผู้เยี่ยมชม', photoUrl: '', lineUserId: '', isGuest: true };",
'      hideLoading();',
'      updateUIWithUser(currentUser);',
'      loadFeed();',
'    } else {'
].join(NL);
idx = replaceOnce(IDX, idx, G1_OLD, G1_NEW, "displayName: 'ผู้เยี่ยมชม'");

// G2: helpers + login prompt control (ก่อน showLoginScreen)
const G2_OLD = 'function showLoginScreen() {';
const G2_NEW = [
'function isGuest(){',
'  try {',
'    var ov = (APP_CONFIG.tenant.overrides || {})[tenantId()];',
"    if (ov && ov.auth === 'anonymous') return false;",
'    var u = firebase.auth().currentUser;',
'    return !u || u.isAnonymous;',
'  } catch(e){ return false; }',
'}',
'function requireLogin(){',
'  if (!isGuest()) return true;',
'  showLoginPrompt();',
'  return false;',
'}',
"function showLoginPrompt(){ var m = document.getElementById('loginPrompt'); if (m) m.classList.add('open'); }",
"function closeLoginPrompt(){ var m = document.getElementById('loginPrompt'); if (m) m.classList.remove('open'); }",
'function showLoginScreen() {'
].join(NL);
idx = replaceOnce(IDX, idx, G2_OLD, G2_NEW, 'function requireLogin(){');

// G3: login prompt modal HTML (ก่อน PRODUCT DETAIL MODAL)
const G3_OLD = '<!-- ══ PRODUCT DETAIL MODAL ══ -->';
const G3_NEW = [
'<!-- ══ LOGIN PROMPT (guest gate) ══ -->',
'<div class="cart-modal" id="loginPrompt" onclick="if(event.target===this)closeLoginPrompt()">',
'  <div class="cart-sheet">',
'    <div style="padding:24px 22px 30px;text-align:center">',
'      <div style="font-size:42px">🔒</div>',
'      <div style="font-size:18px;font-weight:800;margin-top:8px">เข้าสู่ระบบก่อนนะครับ</div>',
'      <div style="font-size:14px;color:var(--muted);margin-top:8px;line-height:1.6">เข้าดูได้ทุกอย่างฟรี แต่ถ้าจะโพส คอมเมนต์ กดไลก์ ใช้ AI หมอพืช หรือสั่งซื้อสินค้า ต้องเข้าสู่ระบบด้วย LINE ก่อน</div>',
'      <button onclick="loginWithLine()" style="margin-top:18px;width:100%;background:#06c755;color:#fff;border:none;border-radius:10px;padding:14px;font-size:15px;font-weight:700;cursor:pointer">เข้าสู่ระบบด้วย LINE</button>',
'      <button onclick="closeLoginPrompt()" style="margin-top:8px;width:100%;background:none;border:none;color:var(--muted);font-size:14px;cursor:pointer;padding:8px">ไว้ก่อน</button>',
'    </div>',
'  </div>',
'</div>',
'',
'<!-- ══ PRODUCT DETAIL MODAL ══ -->'
].join(NL);
idx = replaceOnce(IDX, idx, G3_OLD, G3_NEW, 'id="loginPrompt"');

// G4-G9: gate 6 จุด
idx = replaceOnce(IDX, idx, 'function openPostModal(){',
  'function openPostModal(){' + NL + '  if (!requireLogin()) return; // guard-post', 'guard-post');
idx = replaceOnce(IDX, idx, 'async function submitPost() {',
  'async function submitPost() {' + NL + '  if (!requireLogin()) return; // guard-post2', 'guard-post2');
idx = replaceOnce(IDX, idx, 'async function addComment(postId) {',
  'async function addComment(postId) {' + NL + '  if (!requireLogin()) return; // guard-comment', 'guard-comment');
idx = replaceOnce(IDX, idx, 'async function setReaction(type) {',
  'async function setReaction(type) {' + NL + '  if (!requireLogin()) return; // guard-react', 'guard-react');
idx = replaceOnce(IDX, idx, 'function openAiDoctor() {',
  'function openAiDoctor() {' + NL + '  if (!requireLogin()) return; // guard-ai', 'guard-ai');
idx = replaceOnce(IDX, idx, 'function goCheckout(){',
  'function goCheckout(){' + NL + '  if (!requireLogin()) return; // guard-checkout', 'guard-checkout');

fs.writeFileSync(IDX, idx);
console.log(CHANGED ? '✅ patch #3 สำเร็จ' : '✅ ไม่มีอะไรเปลี่ยน (idempotent)');
