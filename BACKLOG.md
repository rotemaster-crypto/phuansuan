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
- ✅ **🔴 เคลียร์หมดแล้ว (2026-08-27):** XSS admin.html+index.html ปิดครบ + guard A2 ครอบ 2 ไฟล์ · คอมเมนต์โหลดแล้ว → **งานถัดไปเริ่มที่ 🟡** (แนะนำ: dashboard เจ้าของร้าน / คอมเมนต์ pagination / Activity Engine แก้ไขได้)
- ⚠️ **main ยังไม่ push** — ahead origin ~34 commits (งาน hardening + doc + XSS + comments)
- ⚠️ **ก่อน push/deploy:** (1) push→main = deploy จริง · (2) prod `tenant.domains` ต้องครบ (web.app + firebaseapp.com) ไม่งั้น OAuth join พัง (B5)
- แผนฟีเจอร์เสร็จถึง Phase 4 (Activity Engine ทำงานได้) — ที่เหลือคือ **ทำงานได้แต่ไม่ครบ/หยาบ/ไม่ปลอดภัย** ด้านล่าง

---

## 🔴 ต้องแก้ (security / broken) — ทำก่อน

### ~~XSS ที่ A2 แก้ไม่ครบ~~ — ✅ ปิดครบแล้ว 2026-08-27 (admin.html + index.html)
- admin.html: banUser JS-injection, photo url(), displayName/lineUserId, posts moderate, icon img, admin avatar + เพิ่ม `safeUrl()` + ขยาย `tools/guard.mjs` A2 ให้สแกน admin.html
- index.html: affiliate `href` (javascript: scheme) → safeUrl + fallback ปุ่มปกติ · shop banner CSS injection → safeUrl · profile cover concat → safeUrl · img src escapeHtml-only 6 จุด → safeUrl+fallback emoji
- guard เขียว (9 กฎ, A2 ครอบ index+admin) · frontend test 5/5

### ~~Broken (ฟีเจอร์พัง)~~ — ✅ ปิดแล้ว 2026-08-27
- ~~คอมเมนต์ไม่โหลดเลย~~ · เพิ่ม `loadComments(postId)` query `posts/{id}/comments` (orderBy createdAt, escape+safeUrl) เรียกตอน `toggleComments` เปิด · empty/error state ตาม §3 · optimistic append เคลียร์ placeholder ก่อน · rules read คอมเมนต์อนุญาตอยู่แล้ว (เท่ากับสิทธิ์ดูโพสต์)

---

## 🟡 ทำงานได้แต่ไม่ครบ / หยาบ (thin / rough)

### Admin dashboard + super-admin (ที่ Roger ชี้)
- [x] ~~`admin.html:1374` dashboard บาง~~ — ✅ 2026-08-27 เพิ่ม 💰ยอดขายรวม/🛒ออเดอร์วันนี้/🧾ค้างตรวจสลิป/📦สต็อกต่ำ + การ์ด "ต้องจัดการก่อน" (list สต็อกใกล้หมด + CTA สลิป คลิกไปหน้าที่เกี่ยว) · pure `computeShopStats()` (เทสด้วยมือผ่าน) · **ยังขาด: สถิติ activity (lucky draw/missions)** — เพิ่มตอนทำ Activity analytics
- [ ] `admin.html` dashboard scan ทั้ง users+posts+**orders+products** collection (client-side) — ไม่ scale · **M** (= B6/audit · dashboard ใหม่เพิ่ม 2 scan → ทำ count()/agg เมื่อ data โต)
- [ ] `admin.html:1314` sysoverview loop ทุก tenant × full users.get()+orders.get() — **พังเมื่อ tenant/data โต** + metric บาง (ไม่มี revenue/growth ต่อแบรนด์) · **M–L** (= B6/audit)

### Admin — orders
- [ ] orders **ไม่มี search** (order id/ชื่อ/เบอร์/tracking) มีแค่ filter tab สถานะ · **M**
- [ ] `admin.html:3370` orders `.get()` ทั้งหมดทุกครั้ง — ไม่มี pagination/date range · **M**
- [ ] ไม่มี bulk action / export CSV / mark COD เก็บแล้ว / partial refund · **M**

### Admin — Activity Engine (รูใหญ่สุดของ "engagement product")
- [ ] **แก้ไขไม่ได้เลย** — lucky draw/missions/earn/predictions = สร้างใหม่+toggle+ลบ เท่านั้น (แก้ prize ต้องลบสร้างใหม่) · **M ต่ออัน**
- [ ] **ไม่มีผล/analytics** — lucky draw ไม่โชว์การกระจายรางวัล/รายชื่อผู้ชนะ · missions ไม่โชว์จำนวนคนทำสำเร็จ · earn ไม่โชว์แต้มที่แจก · predictions ดูรายการคนทาย/คำตอบไม่ได้ · **L**
- [ ] prediction settle เป็น `prompt()` (2578) ดูรายการก่อนเฉลยไม่ได้ · **S**

### Admin — อื่นๆ
- [ ] products: category hardcode (`catEmojiA` 2169) · ไม่มี bulk/sort · search แค่ชื่อ · `PC_TIERS` (2177) hardcode 0/5/10/15 เสี่ยง drift กับ config.js · **M/S**
- [ ] courier: ไม่มี guard กันปิด mock (ไปโหมดจริง) ทั้งที่ `hasKey=false` · **S**
- [ ] badges (2706) + team admin (3044) = read-modify-write ทั้ง array → 2 แอดมินแก้พร้อมกันทับกัน · **S**
- [ ] team admin: โชว์ UID ดิบ ไม่มีชื่อ/avatar/เจ้าของ/โอนเจ้าของ · **S–M**
- [ ] `admin.html:3359` bocean request status `'provisioned'` ไม่มีใน `BOCEAN_META` → badge สี undefined · **S**

### Customer (index.html)
- [ ] `index.html:2913` feed filter `tenantId===tenantId()` **ซ้ำซ้อน** (path per-tenant อยู่แล้ว) แต่ **drop โพสต์ที่ไม่มี field tenantId เงียบๆ** (โพสต์ legacy/import) → feed อาจโชว์ < 10 · ลบ filter หรือ backfill · **S**
- [ ] feed/leaderboard/order-history **ไม่มี pagination** (`.get()` แล้ว slice — feed 2889, leaderboard 1664, orders 4002) โตแล้วเจอเพดาน/ช้า · **M** (= B8/audit)
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
- [ ] ⚠️ verify: brand-admin ของ tenant ≠ phuansuan บน domain รวม — `aTid()` derive จาก hostname (admin.html:3023) → `lineAuth({tid})` อาจเช็คผิด tenant · **S ตรวจ / M ถ้าเป็นจริง**
- [ ] **Business (Phase 3):** dogfood DemeterRich + ลูกค้านำร่อง 1 ราย + วัดผล "ใช้จริง+สั่งผลิตเพิ่ม"
- [ ] **Phase 5 (เลื่อนตั้งใจ):** ผู้ช่วยการตลาด AI (reuse Gemini) · เอกสารใบเสนอราคา (ใบส่งของมีแล้ว) · B2B/ราคาส่ง · reorder autopilot · PMS connector · payment gateway อัตโนมัติ · SaaS billing รายเดือน

---

## เจอใหม่ระหว่างทาง (เพิ่มที่นี่)
- (ว่าง — เพิ่มเมื่อเจอ)
