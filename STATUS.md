# STATUS — สร้างอะไรจริงบ้าง (ground truth)

> อัปเดตล่าสุด: 2026-08-24 · อ้างอิงจากการสแกนโค้ดจริง (`index.html`, `admin.html`, `functions/index.js`, `firestore.rules`)
> **เอกสารนี้ = ความจริงของโค้ด** ไม่ใช่วิสัยทัศน์ · ถ้าโค้ดเปลี่ยน ให้แก้ไฟล์นี้ก่อน
> เกณฑ์: ✅ BUILT (ใช้ได้จริง) · 🟡 PARTIAL/STUB (มีโครงแต่ยังไม่ครบ) · 🔴 ABSENT (ยังไม่มี)

---

## ตารางสรุป

| ฟีเจอร์ | สถานะ | ตำแหน่งหลัก |
|---|---|---|
| Multi-tenant isolation | ✅ BUILT (แต่ **ไม่มีเทสต์** + มีบั๊ก) | `firestore.rules:31-87`, `index.html:2337`, `functions/index.js:21-38` |
| Rules test / emulator | 🔴 ABSENT | — (ไม่มี test file, ไม่มี emulator config) |
| Community: feed/โพสต์/คอมเมนต์/รีแอคชัน | ✅ BUILT | `index.html:2210-2312, 2604-2635`; `functions/index.js:304-406` |
| Community groups (กลุ่ม + join) | ✅ BUILT (คุมต่อแบรนด์) | `index.html` (screen-community/screen-group), `admin.html` (screen-groups), `functions/index.js` (onGroupMemberWrite), `firestore.rules:69-77` |
| Points / Tiers / Leaderboard | ✅ BUILT (ให้แต้มฝั่ง server) | `functions/index.js:256-457`; `index.html:1522` |
| Badges | 🟡 STUB (นิยามไว้ แต่ไม่เคยแจกจริง) | `config.js:219`, `index.html:1804` |
| Shop/ตะกร้า/เช็คเอาท์/ออเดอร์ (B2C) | ✅ BUILT | `index.html:2746-3213`; `admin.html:656` |
| PromptPay QR + อัปสลิป (ยืนยันมือ) | ✅ BUILT (EMVCo จริง) | `index.html:3023-3137` |
| CSV import สินค้า (PapaParse) | ✅ BUILT (import อย่างเดียว) | `admin.html:1275-1387` |
| Auth LINE/LIFF + guest + Google/FB | ✅ BUILT | `index.html:956-1024`; `functions/index.js:41-127` |
| FCM push | ✅ BUILT | `functions/index.js:409-422` |
| Brand/tenant profile + ธีม | ✅ BUILT | `admin.html:262-576`; `themes.js` |
| ราคาสินค้าเป็นตัวเลข | ✅ BUILT (2026-08-25) | `admin.html` parsePrice + ปุ่ม migrate · `index.html:2935` |
| **เครื่องมือต้นทุน–ราคา–margin** | ✅ BUILT (2026-08-25) | `admin.html` screen-pricing (`pricingCalc`), field `cost` ต่อสินค้า, กำไรต่อชั้นสมาชิก |
| **ผู้ช่วยการตลาด (AI content)** | 🔴 **ABSENT** | — (AI มีแค่ "หมอพืช") |
| AI หมอพืช (Gemini vision) | ✅ BUILT (โควตา 5/วัน) | `functions/index.js:129-248` |
| เอกสาร (ใบเสนอราคา/ใบส่งของ) | 🔴 ABSENT | — |
| B2B / ราคาส่ง / ราคาต่อลูกค้า | 🔴 ABSENT | — |
| Bocean landing + ฟอร์มขอเปิดร้าน | ✅ BUILT (lead → `tenantRequests`) | `bocean.html:253`; `admin.html:178,221` |

---

## หนี้เทคนิคที่ต้องรู้ (ก่อนทำงานต่อ)

1. ~~**ไม่มีเทสต์ใดๆ**~~ ✅ **มี rules-test แล้ว** — `tests/rules.test.js` (15 เคส isolation) รันผ่าน 15/15 บน emulator (2026-08-24) + CI workflow (รอ push ยืนยันบน GitHub) · หมายเหตุ: unit test ตรรกะแอปอื่นๆ ยังไม่มี
2. ~~**บั๊ก settings — 2 คลังตั้งค่าแข่งกัน**~~ ✅ **แก้แล้ว (2026-08-24)** — รวมเป็นคลังเดียว `settings/app`+`settings/features` · `saveBranding`/`setFeature` เขียน canonical · ลบ listener phantom · deploy+เทสต์ผ่าน · orphan doc `settings/{tid}` เก่าลบทีหลังได้ (ไม่มีผล)
3. ~~**legacy rules ระดับ root = ตัว leak จริง**~~ ✅ **ลบแล้ว (2026-08-24)** — ยืนยันไม่มีโค้ดจริงใช้ root path (ทั้งหมดผ่าน `tdb()`/`aDb()`/`troot()`) แล้ว deploy · เหลือ top-level แค่ `/tenants`, `/tenantRequests`, catch-all deny · backup: `docs/_archive/firestore.rules_*.bak`
4. **patch-pile** — `apply_*.js` 30+ ไฟล์ เป็น build history (อ่านไฟล์→`.replace()`→เขียนกลับ) ไม่ใช่ runtime · **เลิกใช้ pattern นี้ แก้ไฟล์ตรงๆ**
5. **index.html ใหญ่ก้อนเดียว ~3,285 บรรทัด** — อย่า rewrite ใหญ่ ให้ refactor เฉพาะตอนแตะไฟล์นั้น

---

## หมายเหตุความเข้าใจผิดที่พบบ่อย

- **"แท็บ Community" = ศูนย์รวมชุมชน** (กลุ่ม + Leaderboard) — แต่ละส่วนเปิด/ปิดต่อแบรนด์ผ่าน `settings/features` (`communityGroups`, `leaderboard`) · ปิดทั้งคู่ = ซ่อน nav ชุมชน
- **Feature flag ต่อแบรนด์** = `settings/features` (per-tenant) · admin หน้า Features toggle เขียน, index listen สด · ของใหม่ default ปิด (`FEAT_DEFAULT_OFF`) เปิดทีละแบรนด์ — ตอนนี้ `pricingTool` (เครื่องมือคิดราคา) คุมเมนู/หน้า/ปุ่มใน admin
- **Multi-tenant สร้างจริงแล้ว** (PROGRESS_4.md เก่าเขียนว่ายัง single-tenant — ไม่จริงแล้ว) แต่ "จริง" ในระดับโครงสร้าง ยังต้อง **ลบ legacy rules #3 + เขียนเทสต์ #1** (isolation) และ **แก้บั๊ก settings #2** (consistency) ก่อนวางใจ — #3+#1 คือเรื่อง leak, #2 เป็นคนละเรื่อง (fail-silent)
- ~~**ราคาสินค้าเป็นข้อความ**~~ ✅ แก้แล้ว (2026-08-25) — admin เก็บ `price`/`oldPrice`/`cost` เป็น number, มีปุ่ม migrate ของเก่า · เครื่องมือต้นทุน–ราคา–margin สร้างแล้ว
