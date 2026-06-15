# Phuansuan — PROGRESS (Phase 3 Complete)

> เพื่อนสวน (Phuansuan) · DemeterRich · phuansuan.web.app
> Phase 3 — Multi-tenant SaaS Foundation (เสร็จสมบูรณ์)

---

## ✅ Phase 3: Multi-tenant SaaS

วางรากฐานให้ **1 codebase + 1 Firebase project** รองรับหลาย tenant (เตรียม subscription/SaaS) แยกข้อมูลด้วย field `tenantId` และตรวจ tenant จาก **โดเมน** (hostname)

ผลลัพธ์: 2 แอปจาก code ชุดเดียว
- **phuansuan.web.app** → tenant `phuansuan` (LINE login, ครบทุกฟีเจอร์)
- **office-phuansuan.web.app** → tenant `office` ("Office Social", anonymous auth, ปิด AI/แจ้งเตือน, feed/แต้ม/admin แยกขาด)

### สิ่งที่ทำ (ตามลำดับ)
1. **Migration** — Cloud Function ครั้งเดียวแปะ `tenantId: "phuansuan"` ลง posts/users เก่า แล้วลบ function ทิ้ง
2. **Tenant isolation** — โพสใหม่ติด `tenantId` อัตโนมัติ; feed + my-posts กรองด้วย `tenantId()` (client-side, เลี่ยง composite index)
3. **Admin moderation** (เห็นเฉพาะ admin) — ลบโพสใครก็ได้ 🗑️ + ปักหมุด 📍/📌 (pinned ขึ้นบนสุด)
4. **Feature Flags real-time** — `settings/{tenantId}` + onSnapshot; Admin Panel (ปุ่ม ⚙️) toggle เปิด/ปิด feature ได้ทันที ไม่ต้อง redeploy (wire จริง 4 ตัว: สตอรี/แต้ม/แจ้งเตือน/AI)
5. **Path B — tenant by hostname** — `tenantId()` map โดเมน → tenant; `config.tenant.domains` + `overrides` (ชื่อ/โลโก้/features ต่อ tenant); `resolveTenant()` apply override ก่อน `applyConfig()`
6. **Multi-site hosting** — `firebase.json` 2 target (main + office) ชี้ content เดียวกัน; `office-phuansuan.web.app` เป็น site ที่ 2 ใน project เดียว
7. **Office = anonymous auth** — เพราะ LINE LIFF มี endpoint เดียว (ดูบทเรียนล่าง) office จึงใช้ `signInAnonymously()` แทน LINE (`override.auth: 'anonymous'`)
8. **Fix บั๊กแต้มซ้ำ** — เอา client-side point write ออก ให้ Cloud Function `onPostCreated` จัดการฝั่งเดียว

---

## 🔑 บทเรียนสำคัญ (อย่าลืม)

- **LINE LIFF = 1 channel : 1 endpoint** — login เด้งกลับ endpoint เดียว (phuansuan.web.app) เสมอ → tenant คนละโดเมนที่ต้องใช้ LINE จะเด้งกลับมาผิด tenant
  - ทางแก้ที่ทำ (office): ใช้ **Firebase Anonymous auth** แทน LINE (ไม่มี redirect)
  - ทางแก้ production (ถ้า tenant ต้องการ LINE จริง): สร้าง **LINE channel/LIFF แยกต่อ tenant** + ใส่ `liffId` ใน override
- **Deploy จาก root** (`firebase.json: "public": "."`) ไม่ใช่ `public/`
- **ส่ง patch แบบกันเพี้ยน:** base64 ยาวเพี้ยนตอน copy → ใช้ **gzip + แบ่งชิ้นเล็ก + sha256 checksum** verify ก่อนรันเสมอ
- **patch มี self-check ในตัว** — รันเสร็จ verify markers + JS valid, ถ้าไม่ครบ exit error ไม่เขียนไฟล์ครึ่ง ๆ (กันพังเงียบ)
- **อย่าใช้ `node -e "..."` ใน bash** — `!` โดน history expansion พังคำสั่ง → ใช้ไฟล์ `check.js` (heredoc `'EOF'`)
- **Migration ก่อนเปลี่ยน query** — backfill `tenantId` ลง doc เก่าก่อน ไม่งั้น feed หาย
- Firestore Rules ใช้ `signedIn()` → anonymous user เขียนโพส/โปรไฟล์ตัวเองได้ ไม่ต้องแก้ rules; admin ใช้ custom claim `admin==true` (จาก lineAuth)

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
9. 🟡 Community → ใช้ feed กลาง + admin moderation แทนระบบกลุ่มแยก
10. ✅ Multi-tenant SaaS (phuansuan + office) + Admin Panel + Feature Flags

---

## 🔮 ถัดไป

- **Auto-deploy** — `.github/workflows/deploy.yml` (deploy ทุก hosting target อัตโนมัติเมื่อ push) + Service Account ใน GitHub Secret `FIREBASE_SA_PHUANSUAN` (ยังไม่เสร็จ)
- เพิ่ม tenant ใหม่: สร้าง hosting site + เพิ่ม target ใน `firebase.json` + 1 บรรทัดใน `config.tenant.domains` (+ override) → push
- ถ้า tenant ใหม่ต้องการ LINE จริง: สร้าง LINE channel/LIFF แยก + ใส่ `liffId` ใน override
- Upgrade tenant filter เป็น server-side (`.where` + composite index) เมื่อข้อมูลเยอะ
- ลบ anonymous users เก่า (10 มิ.ย.) ของ dev
- เชื่อม LINE Shop เมื่อพร้อม (funnel กลับ DemeterRich)

---

## 🔧 ไฟล์อ้างอิง
- `index.html` — แอปทั้งหมด (single file, vanilla JS)
- `config.js` — customization layer (tenant/domains/overrides/features/admin/points/crops/products)
- `functions/index.js` — Cloud Functions (lineAuth + custom claim admin, onPostCreated เพิ่มแต้ม)
- `firestore.rules` — signedIn/isOwner/isAdmin
- `firebase.json` — 2 hosting target (main/office)
