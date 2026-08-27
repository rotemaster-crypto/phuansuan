# BACKLOG — งานค้างจริง (อ่านก่อนเริ่มทุกครั้ง)

> **นี่คือลิสต์งานที่ยังไม่เสร็จจริง** (สแกนโค้ด 2026-08-26 ไม่เชื่อ done-log)
> `ROADMAP.md`/`STATUS.md`/`CHECKLIST.md` = "done log" (จดเฉพาะที่ทำเสร็จ) → **อย่าใช้ดูว่าเหลืออะไร**
> คู่กับ: `CLAUDE.md` (สัญญา+กฎ) · `ARCHITECTURE.md` (แผนที่) · `AUDIT_FINDINGS.md` (audit เต็ม)
>
> **วิธีใช้:** เปิดมาอ่านหัวข้อ "สถานะปัจจุบัน" + หยิบ item จาก 🔴 ก่อน → ทำเสร็จติ๊ก `[x]` + ลบออก/ย้าย → เจอใหม่ให้เพิ่ม
> **ก่อน commit:** `node tools/guard.mjs` + test ต้องผ่าน (ดู CLAUDE.md §7)

---

## 📍 สถานะปัจจุบัน (resume pointer) — อัปเดต 2026-08-27 (สิ้นเซสชันใหญ่)
**origin/main = `c97ff92` · prod live ทุกอย่าง · deploy มือผ่าน `firebase deploy` (login rotemaster@gmail.com พร้อม)**

**✅ ทำเสร็จ+deploy+verify prod เซสชันนี้:**
- XSS admin+index ครบ + guard A2 ครอบ 2 ไฟล์ · คอมเมนต์ไม่โหลด→`loadComments` (verify คอมเมนต์จริง)
- Dashboard เจ้าของร้าน (shop stats + "ต้องจัดการก่อน" + Activity stats) — verify prod
- **Activity Engine ครบ 4 engine** (predictions/luckydraw/missions/earn): edit + analytics + counter-on-doc + e2e — verify prod
- Orders: search + cursor pagination + Export CSV (injection-safe) + bulk select + **bulk status change** (money op, server-validated)
- Feed cursor pagination + โหลดเพิ่ม (verify prod: 9→12, no-dup)
- Products bulk/sort · Team-admin race fix (arrayUnion/Remove) · lineAuth single-point-of-failure fix (e2e 110/110)
- SW v2 · **.gitattributes (LF)** · **`no-cache` บน HTML** (แก้ต้นเหตุ stale-after-deploy) · CI `deploy-functions` job

**🔧 prod incidents ที่แก้ (ops):**
- tenant `phuansuan` เคย `status:suspended` → admin/callable ล่มทั้งหมด → PATCH เป็น active (ecofora/phetpaya ด้วย) · ทั้ง 3 active
- แก้ผ่าน Firestore/Identity-Toolkit REST + gcloud token (`CLOUDSDK_PYTHON`→Python315) · classifier บล็อก prod-write → รันได้เมื่อ user ยืนยัน

**⚠️ ค้าง/ต้องรู้ (รอบหน้าอ่านตรงนี้):**
- **CI deploy ยัง fail** — secret `FIREBASE_SA_PHUANSUAN` ไม่ได้ตั้ง (ดู 🔴 deploy-infra) → deploy มือไปก่อน
- **Facebook login:** ⏸️ **พักไว้ (Roger: ยุ่งยาก 2026-08-27)** — infra ครบ (LINE+Google ใช้ได้แล้ว) · ถ้าจะทำ: user สร้าง FB app + enable ใน Firebase Console → แล้ว flip `config.js` `auth.providers.facebook:true`
- authorized domains ครบแล้ว (phuansuan/office/bocean × web.app+firebaseapp.com)
- **หมายเหตุ verify prod:** cache แก้เป็น no-cache แล้ว → deploy ใหม่ fresh ทันที (ไม่ต้อง clear cache แล้ว) · แต่ browser ที่ cache ก่อนแก้ต้อง Ctrl+Shift+R ครั้งเดียว

**🟡 งานถัดไป (เลือกจากนี่):** badges race (read-modify-write เหมือน team ที่แก้แล้ว) · sysoverview scale (loop ทุก tenant × full get) · products category dynamic + PC_TIERS จาก config · orders mark-COD/partial-refund · streak engine

---

## 🆕 งานใหม่จาก Roger (2026-08-27 รอบสอง) — เรียงตามที่สั่ง
> 🔴 กอง deploy-infra ด้านล่าง = **บล็อกที่ agent ทำเองไม่ได้** (ต้องสิทธิ์ Firebase/GitHub ของ Roger) → งานที่ลงมือได้จริงคือกองนี้

### N0 — เอา feature ออกจาก toggle (flag-off + เก็บโค้ด ตาม [[trim-features-flag-off]]) · **S**
- [x] ~~เอา 4 อันออกจาก features toggle UI~~ — ✅ 2026-08-27: ลบ toggle-row (aiDiagnosis/communityGroups/weatherAlert/notifDisease) + เอา key ออกจาก `FEAT_MAP` · โค้ดข้างหลังคงไว้ · config flag `false` เดิม · `proximityAlert` คงไว้ · guard เขียว

### N1 — แยก "ตกแต่งร้าน" กับ "จัดส่ง" ออกจากกันในหน้า control · **S–M**
- [x] ~~แยก 2 หน้า~~ — ✅ 2026-08-27: sidebar 2 เมนู (`ตกแต่งร้าน`→shopdecor / `จัดส่ง`→shipping) · แยก screen `screen-shipping` (ผู้ส่ง+ค่าส่ง+เชื่อมขนส่ง) · `loadShippingScreen()` + loaders map · `loadShopDecor` เลิกโหลดข้อมูลจัดส่ง · guard+frontend เขียว

### N2 — ใบส่งสินค้ายัง version เดิม ไม่ดึง Shippop API · **M**
- [x] ~~ใบส่งไม่ดึงผลจอง API~~ — ✅ 2026-08-27: `printDeliveryNote` ดึง `courier`+`trackingNumber`/`shippopCode` ที่ `createShipment` (Shippop) จองไว้มาเติมอัตโนมัติ (map รหัส→ชื่อขนส่ง) + badge "ดึงเลขพัสดุจากการจองอัตโนมัติแล้ว" + ปุ่มเปิด `labelUrl` จริง (validate `^https?://`) เมื่อมี · guard+frontend เขียว
- [ ] **N2b (รอ sandbox key):** backend ยังเขียน `labelUrl:""` เสมอ — ยังไม่ยิง Shippop label API ดึงรูปใบปะหน้า barcode ทางการ · ต้องเพิ่ม callable `getShipmentLabel` (key ฝั่ง server) + **verify กับ sandbox จริงก่อน** (ห้ามเดา contract) · ปุ่มฝั่ง client รองรับไว้แล้ว (โผล่เมื่อ labelUrl มีค่า)

### N3 — หมวดหมู่สินค้ายังล็อคปุ๋ย/ยา (ระบบเก่า) → ใช้หมวด Shopee · **M**
- [x] ~~ปลดล็อกหมวดเกษตร → Shopee ครบ~~ — ✅ 2026-08-27: `config.js` ขยายเป็น 27 หมวดแนว Shopee (แฟชั่น/ความงาม/มือถือ/บ้าน/อาหาร/สัตว์เลี้ยง...) **คงหมวดเกษตรเดิม 5 หมวด** → สินค้า phuansuan ไม่กำพร้า · customer shop โชว์เฉพาะหมวดที่มีสินค้า
- [x] single-source: admin โหลด `config.js` · `catEmojiA` + select ทั้ง 3 → `populateCategorySelects()` อ่านจาก config (เลิก hardcode) · index derive อยู่แล้ว · guard+frontend เขียว · id ไม่ซ้ำ
- **PC_TIERS** (`admin.html:2404`) = ส่วนลดตาม tier สมาชิก ไม่เกี่ยวหมวด — ไม่แตะ
- **ค้าง (future):** หมวดต่อแบรนด์จริง (settings per-tenant) แทน global default

### N4 — ไอคอนที่ไม่ minimal ทำให้ระบบดูแย่ · **M–L**
- **ทิศทาง (Roger อนุมัติจาก preview 2026-08-27):** SVG line minimal · เก็บ emoji content (tier 🥇🥈🥉💎 / แบรนด์ 🌿🌱 / เนื้อโพสต์) · **reaction ทำสไตล์ FB/IG**
- [x] ~~admin หัวข้อทั้งหมด~~ — ✅ 2026-08-27: แปลง 64 page-title/card-title emoji → SVG (เพิ่มไอคอน i-star/i-tag/i-chart/i-alert/i-flame/i-gamepad/i-lock/i-type/i-coins/i-calc) · เหลือ 🌿 แบรนด์ 2 จุด (ตั้งใจเก็บ) · guard+frontend เขียว
- [x] ~~reaction feed สไตล์ FB/IG~~ — ✅ 2026-08-27: `index.html` reaction เป็น SVG วงกลมสี (rx-like/love/haha/wow/sad Twemoji-style) · ปุ่ม default = outline thumb (i-thumb) → กดแล้วเป็น reaction สี · picker hover ขยาย · ป้ายรวม stacked · lift `.pa.liked` red filter
- [x] ~~ปุ่ม + feed chrome~~ — ✅ 2026-08-27: admin dashboard stat-icons 12 อัน + ปุ่ม bulk orders (5) + products bulk ลบ + พิมพ์บิล + "กำลังดูแล" · index: feed tab/pts-title/privacy-chip/shop-title/modal titles/admin FAB/cover/featured/rel-title/ปุ่ม save-start → SVG หรือตัด emoji (JS textContent เลี่ยง innerHTML+userdata) · เพิ่ม i-printer/i-calendar/i-globe/i-star/i-sliders · icon refs ครบ ไม่มี missing
- **เก็บไว้ตั้งใจ (content ไม่ใช่ chrome):** toast ✅❌ · tier 🥇🥈🥉💎🏅 · แบรนด์ 🌿🌱 · หมวดสินค้า 💊🧴💧🔧 (=N3) · post-type chips 🦠💡⚠️📦 · celebration 🎉🙏👋 · reward 🎟️ · glyph พิมพ์ปกติ ✕←→ · ป๊อปอัปพิมพ์ใบส่ง (แยก doc ไม่มี sprite)
- **N4 เสร็จ** (เหลือหมวดสินค้า emoji = ทำใน N3) · preview: artifact 7c887b0e-87cd-4c37-ace7-f15941b30596

### N5 — เปิดร้านเอง (self-service brand onboarding) + ยืนยันตัวตนร้าน · **L (ต้องออกแบบ)**
- [ ] brand เปิดร้านได้เองไม่ต้องรอ admin อนุมัติ **แต่กรองข้อมูลจำเป็นเบื้องต้นก่อนเปิด** (ตอนนี้ flow ผ่าน `tenantRequests` + admin อนุมัติ — ดู `admin.html:3359` bocean request)
- [ ] หลังเปิดแล้ว มี **ระบบยืนยันตัวตนร้าน** (verified badge) ให้ลูกค้ามั่นใจว่าผ่านการยืนยันกับเราแล้ว
- **ทิศทาง (ตัดสิน 2026-08-27):** ทำแนว **มินิแอปแยกต่อแบรนด์ก่อน** — marketplace รวมทีหลัง (ดู memory platform-evolution-miniapp-first) → เฟสนี้ไม่ต้องมี cross-tenant browse
- **ต้องออกแบบก่อน** (server-authoritative, rules, [[hold-architecture-no-shortcuts]]): ข้อมูลจำเป็น = อะไร · verify ด้วยวิธีไหน (เอกสาร/โทร/ดูเอง) · badge เก็บที่ไหน (`tenant.verified` server-only)

---

## 🔴 ต้องแก้ (security / broken) — ทำก่อน

### 🚧 deploy-infra — CI deploy พังมาตลอด (เพิ่งเจอ 2026-08-27) · โค้ดยังไม่เคยขึ้น prod ผ่าน CI
- [ ] **secret `FIREBASE_SA_PHUANSUAN` ไม่ได้ตั้ง** (`gh secret list` ว่างเปล่า) → job `deploy` (hosting) fail ทันที "Input required and not supplied: firebaseServiceAccount" · **ต้องตั้ง secret** (`firebase init hosting:github` หรือ manual: SA JSON → GitHub repo Settings→Secrets ชื่อ `FIREBASE_SA_PHUANSUAN`) แล้ว `gh run rerun <id> --failed`
- [x] ~~workflow ไม่ deploy Functions~~ — แก้แล้ว: `firebase-deploy.yml` มี job `deploy-functions` (gated, ใช้ SA ตัวเดียวกัน) → **รอแค่ secret `FIREBASE_SA_PHUANSUAN` ตัวเดียวก็ deploy ทั้ง hosting+functions อัตโนมัติ** · SA ต้องมี Firebase Hosting Admin + Cloud Functions Admin + Cloud Run Admin + Artifact Registry Admin + Service Account User
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
