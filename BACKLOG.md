# BACKLOG — งานค้างจริง (อ่านก่อนเริ่มทุกครั้ง)

> **นี่คือลิสต์งานที่ยังไม่เสร็จจริง** (สแกนโค้ด 2026-08-26 ไม่เชื่อ done-log)
> `ROADMAP.md`/`STATUS.md`/`CHECKLIST.md` = "done log" (จดเฉพาะที่ทำเสร็จ) → **อย่าใช้ดูว่าเหลืออะไร**
> คู่กับ: `CLAUDE.md` (สัญญา+กฎ) · `ARCHITECTURE.md` (แผนที่) · `AUDIT_FINDINGS.md` (audit เต็ม)
>
> **วิธีใช้:** เปิดมาอ่านหัวข้อ "สถานะปัจจุบัน" + หยิบ item จาก 🔴 ก่อน → ทำเสร็จติ๊ก `[x]` + ลบออก/ย้าย → เจอใหม่ให้เพิ่ม
> **ก่อน commit:** `node tools/guard.mjs` + test ต้องผ่าน (ดู CLAUDE.md §7)

---

## 📍 สถานะปัจจุบัน (resume pointer)
- Hardening (audit) เสร็จ: door-open ปิด + order state machine + guard/CLAUDE.md · test เขียว (e2e 110 + rules 51 + frontend 5 + guard 9)
- ✅ **push แล้ว 2026-08-27** (origin/main = 06c8b98) · gate เขียว (e2e 110 + rules + guard + frontend) · **แต่ deploy FAIL** → โค้ดยังไม่ขึ้น prod (ดู 🔴 deploy-infra ล่าง)
- ✅ **ทำเสร็จ session นี้ (2026-08-27):** XSS admin+index ครบ · คอมเมนต์โหลดได้ · dashboard เจ้าของร้าน · **Activity Engine ครบ 4 engine** (edit+analytics+counter-on-doc) · .gitattributes กัน EOL flip
- ⚠️ **ยัง verify สดไม่ได้** (ต้อง login admin/LINE): dashboard, activity edit/analytics — ทดสอบ static+unit+e2e ผ่านหมด แต่ DOM-wiring ยังไม่ได้กดจริง
- ⚠️ **B5 ก่อน OAuth ใช้งานจริง:** prod `tenant.domains` ต้องครบ (web.app + firebaseapp.com + custom)
- ⚠️ **ก่อน push/deploy:** (1) push→main = deploy จริง · (2) prod `tenant.domains` ต้องครบ (web.app + firebaseapp.com) ไม่งั้น OAuth join พัง (B5)
- แผนฟีเจอร์เสร็จถึง Phase 4 (Activity Engine ทำงานได้) — ที่เหลือคือ **ทำงานได้แต่ไม่ครบ/หยาบ/ไม่ปลอดภัย** ด้านล่าง

---

## 🔴 ต้องแก้ (security / broken) — ทำก่อน

### 🚧 deploy-infra — CI deploy พังมาตลอด (เพิ่งเจอ 2026-08-27) · โค้ดยังไม่เคยขึ้น prod ผ่าน CI
- [ ] **secret `FIREBASE_SA_PHUANSUAN` ไม่ได้ตั้ง** (`gh secret list` ว่างเปล่า) → job `deploy` (hosting) fail ทันที "Input required and not supplied: firebaseServiceAccount" · **ต้องตั้ง secret** (`firebase init hosting:github` หรือ manual: SA JSON → GitHub repo Settings→Secrets ชื่อ `FIREBASE_SA_PHUANSUAN`) แล้ว `gh run rerun <id> --failed`
- [ ] **workflow ไม่ deploy Functions เลย** — `firebase-deploy.yml` มีแค่ `action-hosting-deploy` (hosting) · backend changes (claimCount/earn counters ฯลฯ) ไม่ขึ้น prod · ต้อง deploy มือ (`firebase deploy --only functions --project phuansuan`) **หรือ** เพิ่ม job `deploy-functions` ใน workflow (SA ต้องมีสิทธิ์ Cloud Functions Admin + Service Account User)
- หมายเหตุ: นี่เป็น infra gap เดิม (secret ไม่เคยมี) ไม่ใช่จากงาน 2026-08-27 · ต้องใช้สิทธิ์ Firebase/GitHub ของ Roger (agent ทำเองไม่ได้)

### ~~XSS ที่ A2 แก้ไม่ครบ~~ — ✅ ปิดครบแล้ว 2026-08-27 (admin.html + index.html)
- admin.html: banUser JS-injection, photo url(), displayName/lineUserId, posts moderate, icon img, admin avatar + เพิ่ม `safeUrl()` + ขยาย `tools/guard.mjs` A2 ให้สแกน admin.html
- index.html: affiliate `href` (javascript: scheme) → safeUrl + fallback ปุ่มปกติ · shop banner CSS injection → safeUrl · profile cover concat → safeUrl · img src escapeHtml-only 6 จุด → safeUrl+fallback emoji
- guard เขียว (9 กฎ, A2 ครอบ index+admin) · frontend test 5/5

### ~~Broken (ฟีเจอร์พัง)~~ — ✅ ปิดแล้ว 2026-08-27
- ~~คอมเมนต์ไม่โหลดเลย~~ · เพิ่ม `loadComments(postId)` query `posts/{id}/comments` (orderBy createdAt, escape+safeUrl) เรียกตอน `toggleComments` เปิด · empty/error state ตาม §3 · optimistic append เคลียร์ placeholder ก่อน · rules read คอมเมนต์อนุญาตอยู่แล้ว (เท่ากับสิทธิ์ดูโพสต์)

---

## 🟡 ทำงานได้แต่ไม่ครบ / หยาบ (thin / rough)

### Admin dashboard + super-admin (ที่ Roger ชี้)
- [x] ~~`admin.html:1374` dashboard บาง~~ — ✅ 2026-08-27 เพิ่ม 💰ยอดขายรวม/🛒ออเดอร์วันนี้/🧾ค้างตรวจสลิป/📦สต็อกต่ำ + การ์ด "ต้องจัดการก่อน" (list สต็อกใกล้หมด + CTA สลิป) · pure `computeShopStats()` เทสผ่าน
- [x] ~~dashboard ขาดสถิติ activity~~ — ✅ 2026-08-27 การ์ด "🎮 Activity Engine": หมุนสุ่มรวม/รางวัลที่แจก/ภารกิจสำเร็จ/แต้มจากแคมเปญ/ร่วมทายผล · pure `computeActivityStats()` เทสผ่าน · counter-on-doc (อ่าน config collections 4 อัน — เล็ก)
- [ ] `admin.html` dashboard scan ทั้ง users+posts+**orders+products** collection (client-side) — ไม่ scale · **M** (= B6/audit · dashboard ใหม่เพิ่ม 2 scan → ทำ count()/agg เมื่อ data โต)
- [ ] `admin.html:1314` sysoverview loop ทุก tenant × full users.get()+orders.get() — **พังเมื่อ tenant/data โต** + metric บาง (ไม่มี revenue/growth ต่อแบรนด์) · **M–L** (= B6/audit)

### Admin — orders
- [x] ~~orders search~~ — ✅ 2026-08-27: search เลขออเดอร์/ชื่อ/เบอร์/tracking (client-side, pure `orderMatchesSearch` เทสผ่าน) + status tab เดิม
- [x] ~~orders `.get()` ทั้ง collection~~ — ✅ 2026-08-27: server cursor pagination (`orderBy createdAt desc .limit(25)` + `startAfter`) + ปุ่ม "โหลดเพิ่ม" · footer โชว์ "แสดง X · โหลดมา Y · ครบแล้ว/โหลดเพิ่ม" (ไม่ silent truncate)
  - หมายเหตุ: search/status filter ทำบน batch ที่โหลดมา (Firestore substring ไม่ได้) → ค้นไม่เจอบอกให้โหลดเพิ่ม · badge paid_review นับจากที่โหลด (paid_review = ล่าสุด อยู่ batch แรก) · date-range ยังไม่มี
- [x] ~~export CSV + bulk select~~ — ✅ 2026-08-27: Export CSV (ที่แสดง/ที่เลือก) · pure `ordersToCsv()` เทสผ่าน · **CSV injection-safe** (field `=+-@` นำหน้า `'`) + BOM ให้ Excel อ่านไทย · checkbox เลือกหลายรายการ + bulk bar
- [x] ~~bulk status change~~ — ✅ 2026-08-27: bulk ยืนยันรับเงิน (confirm dialog โชว์ยอดรวม)/จัดส่ง/ปิดออเดอร์/ยกเลิก ผ่าน setOrderStatus + adminCancelOrder (validate transition ฝั่ง server) · per-order try/catch → ข้ามอันที่ transition ไม่ได้ + สรุป · ยกเลิก→คืนสต็อก+reload products
- [ ] mark COD เก็บแล้ว · partial refund · **M**

### Admin — Activity Engine (edit + analytics · counter-on-doc · กำลังทำยาว 4 engine)
> design: [[activity-engine-crud-analytics]] · modal กลาง `.act-modal` + convention `editId` (สร้างจาก predictions ใช้ซ้ำ 3 engine ที่เหลือ)
- [x] ~~Predictions~~ — ✅ 2026-08-27: edit (prefill+update, ล็อกโหมด/ตัวเลือกเมื่อมีคนทายแล้ว, ไม่แตะ status/counter) + analytics modal (distribution answer→count/%) + เฉลยจาก dropdown/input แทน `prompt()` ตาบอด · pure `tallyPredictionEntries()` เทสผ่าน
- [x] ~~Lucky Draw~~ — ✅ 2026-08-27: edit (serialize prizes→textarea, **คง awarded เดิมด้วย `_ldMergeAwarded` กัน stock พัง**, ไม่แตะ spins/createdAt) + analytics modal (`tallyLuckyPrizes`: การกระจายรางวัล awarded/spins %/remaining) · เทสผ่าน
- [x] ~~Missions~~ — ✅ 2026-08-27: edit (ไม่แตะ claimCount/createdAt) + `claimCount` increment ใน `claimMission` (ใน tx เดียวกับ guard cSnap.exists = idempotent นับครั้งเดียว/user) + e2e (assert นับ 1 + ไม่นับซ้ำตอนรับซ้ำ) + analytics modal (คนทำสำเร็จ)
- [x] ~~Earn~~ — ✅ 2026-08-27: edit (ไม่แตะ grantCount/grantedPoints/createdAt) + counter `grantCount`/`grantedPoints` ใน onOrderConfirmed (ใน guard pointsAwarded) + onPostCreated (per-campaign, คูณโปรฯ) + e2e (assert แต้มที่แจกถูกนับ) + analytics modal (แต้มที่แจก/จำนวนครั้ง)
- **✅ Activity Engine ครบทั้ง 4 engine** (edit + analytics + counter-on-doc) — modal `.act-modal` + convention `editId` ใช้ซ้ำทั้งชุด

### Admin — อื่นๆ
- [x] ~~products bulk/sort~~ — ✅ 2026-08-27: sort dropdown (ล่าสุด/ชื่อ ก-ฮ/ราคา/สต็อกน้อย→มาก/ขายดี · pure `sortProducts` เทสผ่าน) + bulk select (checkbox + bar: เปิดขาย/ปิดขาย/ลบ · Firestore batch atomic) · ยังเหลือ: category hardcode (`catEmojiA`) · `PC_TIERS` hardcode · search แค่ชื่อ
- [ ] courier: ไม่มี guard กันปิด mock (ไปโหมดจริง) ทั้งที่ `hasKey=false` · **S**
- [x] ~~team admin race~~ — ✅ 2026-08-27: `addTeamAdmin`/`removeTeamAdmin` ใช้ `arrayUnion`/`arrayRemove` (atomic) แทน read-modify-write · rules ล็อกถูก (owner แก้ได้เฉพาะ adminLineIds · super admin เต็ม) · **เหลือ badges (2706) ยัง read-modify-write · team โชว์ UID ดิบ**
- [ ] team admin: โชว์ UID ดิบ ไม่มีชื่อ/avatar/เจ้าของ/โอนเจ้าของ · **S–M**
- [ ] `admin.html:3359` bocean request status `'provisioned'` ไม่มีใน `BOCEAN_META` → badge สี undefined · **S**

### Customer (index.html)
- [ ] `index.html:2913` feed filter `tenantId===tenantId()` **ซ้ำซ้อน** (path per-tenant อยู่แล้ว) แต่ **drop โพสต์ที่ไม่มี field tenantId เงียบๆ** (โพสต์ legacy/import) → feed อาจโชว์ < 10 · ลบ filter หรือ backfill · **S**
- [x] ~~feed ไม่มี pagination~~ — ✅ 2026-08-27: cursor pagination (`orderBy createdAt desc .limit(postsPerPage)` + `startAfter`) + ปุ่ม "โหลดเพิ่ม" · nearby คง geo mode (bounded 100) · pinned/reactions/stats-subscribe คงเดิม · footer "— หมดแล้ว —"
  - leaderboard (top-N `.limit(100).slice(30)`) + my-posts (per-user `.limit(50)`) = **bounded by design** ไม่ใช่ scale issue จริง (ปล่อยไว้)
- [ ] buyer เห็นสถานะออเดอร์เฉพาะเปิด modal เอง — ไม่มี affirmation หลังส่งสลิป / ไม่มี push ตอน admin confirm-ship / tracking โชว์เลขดิบไม่มีลิงก์ขนส่ง · **S**
- [ ] `index.html:3911` checkout dead-end ถ้า promptpayId ไม่ตั้ง (บอกลูกค้า "แจ้งแอดมิน" — copy หยาบ) ควรซ่อน checkout · **S**
- [ ] `index.html:1848` ปุ่มแชร์ไม่แชร์โพสต์นั้นจริง (ไม่ส่ง post id, แชร์ URL แอปกลางๆ) + swallow error · **S**

---

## 🟢 หนี้ audit ที่เลื่อน (ทำเมื่อ trigger — ดู AUDIT_FINDINGS.md กอง B)
- [ ] B6/B7/B8 scalability (count()/sharded counter/pagination) — ทำตอน data โต · **หมายเหตุ: B8 = ตัวเดียวกับ pagination ใน 🟡 ข้างบน**
- [ ] B1 claims defense-in-depth (rules get() member-doc) — perf cost, ทำถ้าต้องการชั้นกันสอง
- [ ] B15 monolith split (index.html ~4,300 / admin ~3,600) — **ต้องขยาย frontend test harness ก่อน** ห้ามรีบรื้อ
- [ ] App Check — ปิด SSRF TOCTOU-rebind + B5 curl (closure เต็มของ closed-tenant) · ทำก่อน launch
- [ ] B16 dedup refactor (crudActions/getSetting helper ใน admin.html) — opportunistic ตอนแตะ
- [ ] แปลง empty-catch ที่เหลือฝั่ง client เป็น error state (opportunistic)

---

## 📋 ฟีเจอร์/ธุรกิจ (ตัดสินใจ/เลื่อน)
- [ ] "ชาเลนจ์"/streak (ทำต่อเนื่อง N วัน) เป็น engine แยกจาก missions — ยังไม่มี · **M** (ของอยากได้เพิ่ม)
- [ ] verify: เครื่องมือคิดราคาฝั่งแอดมิน ต้อง login กดลองสด (ยัง test สดไม่ได้)
- [x] ~~brand-admin cross-tenant + single-point-of-failure~~ — ✅ 2026-08-27: พบว่า `adminTenant()` hardcode phuansuan → `lineAuth({tid:phuansuan})` เรียก resolveTid ก่อน → **phuansuan suspend = admin ทุกแบรนด์ login ไม่ได้** (เจอจริง!) · แก้: lineAuth แยกการตรวจ admin (isAdmin/tadmin ไม่ขึ้นกับ tenant status) ออกจาก membership claim → super/brand-admin login ได้แม้ login-tenant suspended · customer ยัง fail-closed · e2e 110/110 · brand-admin ถูก scope เป็นแบรนด์ตัวเอง (currentTenant จาก claim) ทำงานถูกอยู่แล้ว
- [ ] login หลายช่องทาง: customer มี LINE+Google+Facebook (infra ครบ · เปิดผ่าน `APP_CONFIG.auth.providers`) — ต้อง enable provider ใน Firebase console + OAuth app · admin ยัง LINE-only
- [ ] **Business (Phase 3):** dogfood DemeterRich + ลูกค้านำร่อง 1 ราย + วัดผล "ใช้จริง+สั่งผลิตเพิ่ม"
- [ ] **Phase 5 (เลื่อนตั้งใจ):** ผู้ช่วยการตลาด AI (reuse Gemini) · เอกสารใบเสนอราคา (ใบส่งของมีแล้ว) · B2B/ราคาส่ง · reorder autopilot · PMS connector · payment gateway อัตโนมัติ · SaaS billing รายเดือน

---

## เจอใหม่ระหว่างทาง (เพิ่มที่นี่)
- (ว่าง — เพิ่มเมื่อเจอ)
