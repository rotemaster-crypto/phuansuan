#!/bin/bash
if grep -q "13. รอบล่าสุด — Generalize 4a + Path1 + Tenant Link + Rules + Social Listening" PROGRESS_4.md; then
  echo "SKIP: section นี้มีอยู่แล้ว (idempotent)"
  exit 0
fi
cat >> PROGRESS_4.md << 'PHUAN_EOF'

---

## 13. รอบล่าสุด — Generalize 4a + Path1 + Tenant Link + Rules + Social Listening

### ✅ เสร็จ + ทดสอบ (รัน/deploy/push)
- **ขั้น 4a Generalize terminology** (`apply_terms.js`): `T()` อ่าน live `settings/app.terms` → fallback config.js → default · เพิ่ม `applyTermsText()/applyTerms()` ต่อข้อความ AI/feature/gate/กล่องโพสต์ครบ · hook เข้า listener `settings/app` · admin: การ์ด "🔤 คำศัพท์ร้าน" 5 ช่อง (`saveTerms/loadTerms`) + relabel ป้าย crops/diseases เป็นแท็กกลาง
  - **ไม่แตะ:** chip ประเภทโพสต์ (ผูก data โพสต์เก่า — `p.type` + `typeTagMap`) · backend `analyzePlant` (= งานขั้น 5) · field `crops/diseases` ใน Firestore (ไม่ rename = ไม่ migrate)
- **Path 1 tenant resolution** (`apply_param_tid.js`): `tenantId()` อ่าน `?t=` ก่อน → domains map → id (stateless) · **provisioning = 1-click จริง** ลิงก์ `phuansuan.web.app/?t={tid}` ใช้ได้ทันที ไม่มี Site Not Found
- **Tenant link ในการ์ด Super Admin** (`apply_tenant_link.js`): แต่ละการ์ดโชว์ "ลิงก์ใช้งาน" (จาก `location.origin`) + ปุ่ม 📋 คัดลอก (`copyTenantLink`)
- **Rules audit + ข้อ1** (`apply_rules_userread.js` → `firebase deploy --only firestore:rules`): `tenants/{t}/users` read = `isOwner(uid) || memberOf(t) || canManage(t)` ปิด cross-tenant PDPA leak · ฟีดไม่พังเพราะ author denormalize (`authorName/authorPhoto` ในโพสต์)
  - **ผล audit:** ฝั่ง write/manage แน่นอยู่แล้ว (`?t=` ไม่เปิดช่องเขียน — ทุก write ผูก claim ต่อ tenant) · ที่หลวมคือฝั่ง read เท่านั้น

### ⚠️ ถัดไปทันที / ค้าง
- **ข้อ2 Flexible Feed Mode** (อนุมัติทิศทางแล้ว ยังไม่ build) — 2 แกนคุมจาก admin ต่อแบรนด์ (default = เหมือนเดิม):
  - แกนอ่าน `feedPublic`: rules ใช้ `get()` อ่าน `settings/app` · posts read = `feedPublic(t) || memberOf(t)`
  - แกนเขียน `postMode`: `public`=สมาชิกโพสต์ได้ · `broadcast`=เฉพาะแบรนด์/tadmin โพสต์ ลูกค้าคอมเมนต์/รีแอคเท่านั้น
  - = "โหมดฟีดกึ่งปิด" ในเอกสารกลยุทธ์
- เปิด Google provider ใน Firebase Console (ค้างเดิม) · cleanup legacy collections + sa.json rotate (gated เดิม)

### 🧭 ลำดับที่อนุมัติแล้ว (stabilize first)
1. ✅ rules ข้อ1 (เสร็จ)
2. ข้อ2 Flexible Feed Mode
3. ขั้น 5 Smart Matching Engine (ปลดล็อก Intent Logging)
4. **PDPA consent layer — GATE ก่อนทุก listening feature**
5. LINE push / Auto-Hook (ตะกร้าค้าง/แต้มหมดอายุ)
6. Listening suite: Intent log + AI Sentiment Job + Action tracking (Pro)
7. Billing (เก็บเงิน Pro/Enterprise)
8. Mission Center (retention templates / streak)
9. Cross-platform FB/TikTok sync — **ทบทวน scope/เลื่อน** (เปราะบาง)

### 📦 CSV import (Shopee/Lazada) — "ดึงสินค้าโดยไม่ต้องสร้างเอง" — อย่าลืม
- **คือ CSV import ไม่ใช่ live API** (API เปราะบาง = เหตุผลเดียวกับ push back FB/TikTok) · = เวอร์ชันปลอดภัยของ "ลดภาระแบรนด์"
- blueprint: export จาก Seller Center → upload CSV → parse (papaparse client-side) → preview/column-mapping UI → batchWrite `tenants/{tid}/products` · ใช้ `parsePrice()` เดิม + รองรับ field `crops/diseases` (tag)
- จัดลำดับ: ทำได้ค่อนข้างต้น (self-contained ช่วย onboard sandbox/แบรนด์)

### 🧠 กลยุทธ์ (สรุป — Internal Social Listening)
- **Reposition:** จาก "ซอฟต์แวร์เช่าเปิดร้าน" → "พาร์ทเนอร์รักษาฐานลูกค้า" · รองรับ personal brand/เซลส์รถ/ตัวแทนประกัน (= เหตุผลที่ generalize terminology มีค่า)
- **3 retention:** Mission Center · Flexible Feed Mode (ข้อ2) · Auto-Hook (LINE push)
- **Internal Social Listening (first-party, lock เป็น Pro upsell):** Search/Intent log · AI Sentiment Job (Gemini สรุปคอมเมนต์รายคืน) · Action tracking
- **2 จุด push back ที่ล็อกไว้:** (a) FB/TikTok inbound sync เปราะบาง — ใช้ CSV/embed แทน (b) **PDPA = ประตูบังคับ** ก่อน listening ทุกตัว (consent + anonymize + retention)
- **Validation:** "ต้มยำทำแกงเอง" — ผู้พัฒนาเทสเป็นลูกค้าช่างเลือก ผ่าน sandbox (ecofora/phetpaya) วัด friction + PDPA/Trust ก่อนเปิดแบรนด์จริง
PHUAN_EOF
echo "APPENDED"
