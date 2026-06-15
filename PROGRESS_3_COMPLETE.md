# Phuansuan — PROGRESS (Phase 3 Complete)

> เพื่อนสวน (Phuansuan) · DemeterRich · phuansuan.web.app
> อัปเดต: Phase 3 — Multi-tenant SaaS Foundation

---

## ✅ Phase 3 ที่เสร็จแล้ว

Phase 3 วางรากฐานให้แอปรองรับ **หลาย project บน Firebase เดียว** (multi-tenant) เพื่อเตรียม subscription/SaaS ในอนาคต ทำเป็น 3 step + แก้บั๊ก:

### Step 1 — Tenant config + Data migration
- `config.js` เพิ่ม block `tenant` (id/name/plan) และ `admin` (lineUserId)
- รัน Cloud Function ครั้งเดียว (`migrateTenant`) แปะ `tenantId: "phuansuan"` ลงทุก doc เก่าใน `posts` + `users` → เสร็จแล้วลบ function ทิ้ง
- ผล migration: posts 11, users 2 docs

### Step 2+3 — Tenant isolation + Admin + Feature Flags (รวมเป็น patch เดียว)
- **โพสใหม่** ติด `tenantId` อัตโนมัติ (`tenantId()` helper มี fallback `'phuansuan'`)
- **Feed isolation:** กรอง tenant ฝั่ง client ทั้ง feed หลัก + my-posts → แต่ละ project เห็นเฉพาะโพสตัวเอง (เลือกวิธี client-side filter เพื่อเลี่ยง composite index ที่อาจทำ feed พังตอน build)
- **Admin moderation** (เห็นเฉพาะ admin — เช็ค `currentUser.uid === admin.lineUserId`):
  - ลบโพสใครก็ได้ (🗑️)
  - ปักหมุดโพส (📍/📌) → โพสที่ปักหมุดขึ้นบนสุดของ feed
- **Feature Flags real-time** (`settings/{tenantId}` ใน Firestore + onSnapshot):
  - Admin Panel (ปุ่ม ⚙️ มุมขวาล่าง) toggle เปิด/ปิดแต่ละ feature ได้ทันที ไม่ต้อง redeploy
  - Wire UI จริง 4 ตัว: สตอรี, ระบบแต้ม, แจ้งเตือนพื้นที่, หมอพืช AI
  - flag อื่น (ลิงก์สินค้า/กลุ่ม/อากาศ) เก็บไว้ ยังไม่ผูก element (UI ส่วนนั้นยัง mock)

### Fix — แต้มนับซ้ำ
- เดิม client + Cloud Function (`onPostCreated`) บวกแต้ม+postCount ทั้งคู่ = ได้ 2 เท่า
- เอา client-side Firestore write ออก ให้ Cloud Function จัดการฝั่งเดียว (คง optimistic UI ให้เห็นแต้มทันที)

---

## 🔑 บทเรียน / จุดสำคัญที่เจอใน Phase 3

- **Deploy จาก root ไม่ใช่ `public/`** — `firebase.json` คือ `"public": "."` ไฟล์จริงที่ใช้งานคือ `index.html`/`config.js`/`functions/index.js` ที่ root (เว็บจริงตรงกับ root ไม่ใช่ public/ ที่เป็นเวอร์ชันเก่า) **note เดิมที่ว่า "ทำงานจาก public/" ผิด**
- **ส่ง patch แบบกันเพี้ยน:** base64 ยาวเกินมีโอกาส copy เพี้ยน → ใช้ **gzip + base64 + sha256 checksum** ทุกครั้ง ให้ Roger verify checksum ก่อนรัน
- **อย่าใช้ `node -e "..."` ตรวจ syntax ใน bash** — `!` โดน history expansion ทำคำสั่งพัง → ใช้ไฟล์ `check.js` (heredoc `'EOF'`) แทน
- **ลำดับ migration สำคัญ:** ต้อง backfill `tenantId` ลง doc เก่า *ก่อน* เปลี่ยน query ไม่งั้น feed หาย
- Firestore Rules มี `isAdmin()` (custom claim `admin==true` จาก lineAuth) อยู่แล้ว → admin moderation ไม่ต้องแก้ rules
- patch ทุกตัวออกแบบให้ **idempotent** (รันซ้ำปลอดภัย)

---

## 📊 สถานะ MVP

1. ✅ LINE Login (Phase 1)
2. ✅ Onboarding + Edit Profile (Phase 2)
3. ✅ โพสภาพ + พืช + พิกัด
4. ✅ Feed (+ tenant isolation)
5. ✅ AI วิเคราะห์โรคพืช (Gemini Vision)
6. ✅ Like + Comment
7. ✅ Point system (แก้บั๊กนับซ้ำแล้ว)
8. ✅ Profile + Badge/Tier
9. 🟡 Community/กลุ่ม — ตัดสินใจใช้ feed กลาง + admin ดูแล แทนระบบกลุ่มแยก
10. ✅ Multi-tenant SaaS foundation + Admin Panel + Feature Flags

---

## 🔮 ถัดไป

- **สร้าง Project B (office social):** Firebase project เดียวกัน, `config.js` ใหม่ที่ `tenant.id: "office"` + ปิด features ที่ไม่ต้องการ → deploy ไป hosting อีกตัว (code ชุดเดียวกัน)
- **Auto-deploy:** ตั้ง `firebase init hosting:github` → push main แล้ว deploy เอง
- **Upgrade tenant filter เป็น server-side** (`.where` + composite index) เมื่อ Project ที่ 2 มีข้อมูลเยอะ
- ผูก feature flag เพิ่ม (ลิงก์สินค้า/กลุ่ม/อากาศ) เมื่อ UI ส่วนนั้นทำจริง
- เชื่อม LINE Shop เมื่อพร้อม (funnel กลับ DemeterRich)
