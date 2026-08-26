# STATUS — สร้างอะไรจริงบ้าง (ground truth)

> อัปเดตล่าสุด: 2026-08-26 · อ้างอิงจากการสแกนโค้ดจริง (`index.html`, `admin.html`, `functions/index.js`, `firestore.rules`)
> **เอกสารนี้ = ความจริงของโค้ด** ไม่ใช่วิสัยทัศน์ · ถ้าโค้ดเปลี่ยน ให้แก้ไฟล์นี้ก่อน
> เกณฑ์: ✅ BUILT (ใช้ได้จริง) · 🟡 PARTIAL/STUB (มีโครงแต่ยังไม่ครบ) · 🔴 ABSENT (ยังไม่มี)

---

## ตารางสรุป

| ฟีเจอร์ | สถานะ | ตำแหน่งหลัก |
|---|---|---|
| Multi-tenant isolation | ✅ BUILT + **มีเทสต์ + hardened** (resolveTid fail-closed, callable เช็ค membership, claimTenant origin-binding) | `firestore.rules`, `functions/index.js` resolveTid/assertTenantOrigin, `tests/rules.test.js` |
| **Tests / CI / guard** | ✅ BUILT | `tests/*.test.js` (rules 51 + functions e2e 110 + frontend 5), `tools/guard.mjs` (รั้ว regression), CI **gate deploy ด้วย test** |
| Community: feed/โพสต์/คอมเมนต์/รีแอคชัน | ✅ BUILT | `index.html` (feed/renderPost); `functions/index.js` (onPostCreated/onLikeWrite ฯลฯ) |
| Community groups (กลุ่ม + join) | ✅ BUILT (คุมต่อแบรนด์) | `index.html`/`admin.html` (screen-groups), `functions` onGroupMemberWrite |
| Points / Tiers / Leaderboard | ✅ BUILT (server-only, client เขียน points ไม่ได้แล้ว) | `functions/index.js`; `index.html` leaderboard |
| Badges | ✅ **BUILT (แจกจริง server-side)** | `functions` earnedBadges/updateTier→arrayUnion, admin `settings/badges`, โปรไฟล์ user |
| **Activity Engine: Lucky draw / Campaign / Promo / Missions / Predictions** | ✅ BUILT (server-authoritative + e2e) | `functions` spinLuckyDraw/onOrderConfirmed/claimMission/submitPrediction/getPromoMultiplier; admin screens; `tests/{spin,campaign,mission,prediction}.test.js` |
| **Order state machine** (setOrderStatus + transition + rules lock + pending cap) | ✅ BUILT (2026-08-26) | `functions` setOrderStatus; `firestore.rules` orders; `tests/orderstatus.test.js` |
| Shop/ตะกร้า/เช็คเอาท์/ออเดอร์ (B2C) | ✅ BUILT (ราคา/สต็อก/ส่วนลด server-auth) | `index.html` checkout; `functions` placeOrder |
| **คูปองใช้จริงตอน checkout** | ✅ BUILT | `index.html` loadCheckoutCoupons/selectCoupon → `placeOrder(couponId)` mark used |
| PromptPay QR + อัปสลิป (ยืนยันมือ) | ✅ BUILT (EMVCo จริง) | `index.html` checkout |
| **Shipping (Shippop)** | ✅ BUILT (booking→confirm sandbox) + billing ต่อแบรนด์ | `functions` createShipment/shippingBillingSummary; `tests/{courier,billing}.test.js` |
| CSV/xlsx import สินค้า (Shopee) | ✅ BUILT + paste-link OG | `admin.html`; `functions` fetchProductMeta (SSRF-guarded) |
| Auth LINE/LIFF + guest + Google/FB | ✅ BUILT | `index.html`; `functions` lineAuth/claimTenant |
| FCM push | ✅ BUILT | `functions` sendNotif |
| Brand/tenant profile + ธีม | ✅ BUILT | `admin.html`; `themes.js` |
| ราคาเป็นตัวเลข + เครื่องมือต้นทุน–ราคา–margin | ✅ BUILT (2026-08-25) | `admin.html` screen-pricing, field `cost` ต่อสินค้า |
| AI หมอพืช (Gemini vision) | ✅ BUILT (โควตา 5/วัน, atomic — TOCTOU แก้แล้ว) | `functions` analyzePlant |
| เอกสาร: ใบส่งของ | ✅ BUILT | `admin.html` printDeliveryNote |
| เอกสาร: ใบเสนอราคา | 🔴 ABSENT (Phase 5) | — |
| **ผู้ช่วยการตลาด (AI content)** | 🔴 ABSENT (Phase 5) | — (AI มีแค่หมอพืช) |
| B2B / ราคาส่ง / ราคาต่อลูกค้า | 🔴 ABSENT (Phase 5) | — |
| "ชาเลนจ์"/streak (แยกจาก missions) | 🔴 ABSENT (ของอยากได้เพิ่ม) | — (missions มี start/end + dailyLoginBonus แต่ไม่มี streak) |
| Bocean landing + ฟอร์มขอเปิดร้าน | ✅ BUILT (lead → `tenantRequests`, ต้อง login แล้ว) | `bocean.html`; `admin.html` |

---

## หนี้เทคนิคที่ต้องรู้ (ก่อนทำงานต่อ)

1. ~~**ไม่มีเทสต์**~~ ✅ **มีเทสต์หลายชั้น (2026-08-26)** — rules 51 + functions e2e 110 + frontend 5 (สกัดฟังก์ชันจริงจาก index.html รันใน vm) + `tools/guard.mjs` (รั้ว regression 9 กฎ) · CI **gate deploy ด้วย test** (แดง = ไม่ deploy) · หมายเหตุ: DOM-wiring/admin.html ยังต้อง browser test (ยังไม่ทำ)
2. ~~**บั๊ก settings — 2 คลังตั้งค่าแข่งกัน**~~ ✅ **แก้แล้ว (2026-08-24)** — รวมเป็นคลังเดียว `settings/app`+`settings/features` · `saveBranding`/`setFeature` เขียน canonical · ลบ listener phantom · deploy+เทสต์ผ่าน · orphan doc `settings/{tid}` เก่าลบทีหลังได้ (ไม่มีผล)
3. ~~**legacy rules ระดับ root = ตัว leak จริง**~~ ✅ **ลบแล้ว (2026-08-24)** — ยืนยันไม่มีโค้ดจริงใช้ root path (ทั้งหมดผ่าน `tdb()`/`aDb()`/`troot()`) แล้ว deploy · เหลือ top-level แค่ `/tenants`, `/tenantRequests`, catch-all deny · backup: `docs/_archive/firestore.rules_*.bak`
4. ~~**patch-pile `apply_*.js`**~~ ✅ **ลบแล้ว (2026-08-26)** — ลบ `apply_*.js` ทั้งหมด + orphan (public/, root index.js/package.json/lock) · **แก้ไฟล์ตรงๆ เท่านั้น** ห้ามกลับไป pattern เดิม
5. **index.html ใหญ่ก้อนเดียว ~4,300 บรรทัด** (admin.html ~3,600) — อย่า rewrite ใหญ่ · แตกไฟล์ต้องล้อม frontend test ก่อน (B15 ใน `AUDIT_FINDINGS.md`)
6. **ก่อนทำ feature ใหม่: อ่าน `CLAUDE.md` (สัญญาพฤติกรรม) + `ARCHITECTURE.md` (แผนที่ระบบ)** · หนี้ security/scale ที่เลื่อน + วิธีแก้ อยู่ `AUDIT_FINDINGS.md` · ก่อน merge: `node tools/guard.mjs` + test ต้องผ่าน

---

## หมายเหตุความเข้าใจผิดที่พบบ่อย

- **"แท็บ Community" = ศูนย์รวมชุมชน** (กลุ่ม + Leaderboard) — แต่ละส่วนเปิด/ปิดต่อแบรนด์ผ่าน `settings/features` (`communityGroups`, `leaderboard`) · ปิดทั้งคู่ = ซ่อน nav ชุมชน
- **Feature flag ต่อแบรนด์** = `settings/features` (per-tenant) · admin หน้า Features toggle เขียน, index listen สด · ของใหม่ default ปิด (`FEAT_DEFAULT_OFF`) เปิดทีละแบรนด์ — ตอนนี้ `pricingTool` (เครื่องมือคิดราคา) คุมเมนู/หน้า/ปุ่มใน admin
- **Multi-tenant สร้างจริงแล้ว** (PROGRESS_4.md เก่าเขียนว่ายัง single-tenant — ไม่จริงแล้ว) แต่ "จริง" ในระดับโครงสร้าง ยังต้อง **ลบ legacy rules #3 + เขียนเทสต์ #1** (isolation) และ **แก้บั๊ก settings #2** (consistency) ก่อนวางใจ — #3+#1 คือเรื่อง leak, #2 เป็นคนละเรื่อง (fail-silent)
- ~~**ราคาสินค้าเป็นข้อความ**~~ ✅ แก้แล้ว (2026-08-25) — admin เก็บ `price`/`oldPrice`/`cost` เป็น number, มีปุ่ม migrate ของเก่า · เครื่องมือต้นทุน–ราคา–margin สร้างแล้ว
