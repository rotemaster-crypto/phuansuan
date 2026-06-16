# 📊 PROGRESS — เพื่อนสวน (Phuansuan App)

> เพื่อนสวน (Phuansuan) · DemeterRich · phuansuan.web.app
> อัปเดตล่าสุด: 16 มิถุนายน 2026 — **Phase 3 Commerce เสร็จสมบูรณ์ (ใช้งานจริงครบวงจร)**

---

## 🔢 เลข Phase (เคลียร์ให้ตรงกัน)

แผนเดิมแบ่งไว้ 5 phase — ระหว่างทางมีการทำข้ามคิว ตอนนี้ยึดตามนี้:

| Phase | เนื้อหา | สถานะ |
|-------|---------|-------|
| 1 | Infrastructure, LINE Login/LIFF, Posts & Feed, Point system, Admin | ✅ |
| 2 | Auth จริง, Security Rules, Onboarding, Feed ใกล้ฉัน, Profile, AI วิเคราะห์โรค | ✅ |
| **3** | **Commerce — ตะกร้า + PromptPay + ออเดอร์ + สินค้าในโพส** | ✅ **(ใหม่)** |
| 4 | Template ที่ 2 (สไตล์ IG) | ⬜ ยังไม่เริ่ม |
| 5 | Multi-tenant SaaS + subscription | ✅ **(ทำข้ามคิวมาก่อน)** |

> ⚠️ ไฟล์เก่า `PROGRESS_3_COMPLETE` ที่เขียนว่า "Phase 3 = Multi-tenant" จริง ๆ คือ **Phase 5** — ดูรายละเอียดท้ายไฟล์

---

## ✅ Phase 3 — Commerce (16 มิ.ย. 2026)

Funnel ครบวงจร: **คนโพสปัญหาพืช → เห็นสินค้าที่ช่วยได้ในโพส → ใส่ตะกร้า → จ่าย PromptPay → แอดมินยืนยัน+จัดส่ง → ลูกค้าเห็นสถานะ**

### 3.1 — ร้านค้า + ตะกร้า
- เปลี่ยนปุ่ม nav อันสุดท้าย (☰ เมนู placeholder) → **🛒 ร้านค้า** + ปุ่มตะกร้าบน topbar (badge นับชิ้น)
- หน้าร้าน: กริดสินค้าโหลดจาก Firestore `products` (กรอง `tenantId`) + chips กรองหมวด
- ตะกร้าเก็บใน **localStorage** (key ผูก tenant); ปรับจำนวน/ลบ; คำนวณ ยอด + ส่วนลด tier + ค่าส่งตามน้ำหนัก → ยอดสุทธิ
- คุม commerce ด้วย feature flag (เปิด/ปิดต่อ tenant แบบ real-time)

### 3.2 — Checkout + PromptPay + สลิป + ออเดอร์ของฉัน
- ฟอร์มที่อยู่ (จังหวัด dropdown 77 จังหวัด + อำเภอ/ตำบล/รหัส เป็นช่องพิมพ์) — **จำที่อยู่ไว้ใช้ซ้ำ** (เก็บใน `users/{uid}.shippingAddress`)
- สร้างออเดอร์ใน Firestore `orders` (status `pending_payment`)
- **PromptPay QR ใส่ยอดอัตโนมัติ** — สร้าง payload ฝั่ง client (ตรงกับ lib มาตรฐาน `promptpay-qr` เป๊ะ) เรนเดอร์ด้วย `qrcode.js` เป็น `<img>` data URL (ไม่เรียกเน็ตภายนอก)
- แนบสลิป → อัป Storage `slips/{tenantId}/...` → status `paid_review` + เคลียร์ตะกร้า
- ปุ่ม **📦 ออเดอร์** (มุมขวาบนหน้าร้าน) — ดูออเดอร์ตัวเอง + สถานะ + เลขพัสดุ; ออเดอร์ที่ค้างจ่ายกด "ชำระเงิน" กลับมาดู QR ได้

### 3.3 — Admin จัดการออเดอร์ (admin.html)
- เมนู sidebar ใหม่ **🛒 ออเดอร์** (badge นับ "รอตรวจสลิป")
- กรองสถานะ + การ์ดแต่ละออเดอร์ (ผู้รับ/ที่อยู่/รายการ/ยอด/สลิปกดดูขยาย)
- Action ตามสถานะ: ✅ ยืนยันรับเงิน → 📮 จัดส่ง+เลขพัสดุ → 🏁 ปิดออเดอร์ / ❌ ยกเลิก
- เปลี่ยนสถานะ sync เข้า Firestore → ลูกค้าเห็นทันที

### 3.4a — สินค้าที่เกี่ยวข้องในโพส
- ใต้โพสที่มีแท็กพืช → section **🛒 สินค้าที่อาจช่วยได้** (ถ้ามีสินค้าแท็กตรง)
- จัดอันดับ: ตรงทั้ง *พืช + ชื่อโรค* (เจอในข้อความโพส) มาก่อน, ตรงแค่พืชรองลงมา — สูงสุด 3 ตัว
- ใส่ตะกร้าจากในโพสได้เลย (แม้ยังไม่เปิดหน้าร้าน), เคารพ feature flag

### โครงสร้างข้อมูล / กฎ ที่เพิ่ม
- **Firestore `orders`**: `tenantId, userId, userName, items[] (snapshot), subtotal/discount/shippingFee/total/weight, shipping{}, status, paymentMethod, promptpayAmount, slipUrl, trackingNumber, createdAt/updatedAt/paidAt/confirmedAt/shippedAt/...`
- **status flow**: `pending_payment → paid_review → confirmed → shipped → completed` / `cancelled`
- **firestore.rules `orders`**: เจ้าของอ่าน/สร้าง (เริ่ม pending_payment); เจ้าของอัปเดตได้เฉพาะแนบสลิป+เปลี่ยนเป็น paid_review; admin ทำได้หมด
- **storage.rules `slips/{tenant}/`**: login + รูป ≤5MB
- **config `shop.commerce`**: `promptpayId, promptpayName, shippingTiers[], freeShippingMin, defaultWeightKg, useTierDiscount` + `features.commerce`
- **ไฟล์ใหม่ `qrcode.js`** (qrcode-generator MIT, bundled — สร้าง QR เป็น data URL)
- **สินค้าใน Firestore** มีแท็ก `crops[]`, `diseases[]` (จาก Admin) → ใช้แมตช์ใน 3.4a; ราคาเก็บเป็น **string** ("180 บาท") → มี `parsePrice()` ดึงตัวเลข

---

## 🔑 บทเรียนสำคัญ (อย่าลืม)

**Commerce (Phase 3)**
- **PromptPay payload ลำดับฟิลด์ต้องเป๊ะ** — country `58` มาก่อน currency `53`/amount `54` (ตามที่ lib `promptpay-qr` ทำ) ไม่งั้น CRC + bytes ต่าง — verify ด้วยการเทียบ output กับ lib ทุกครั้ง
- ราคาสินค้าเก็บเป็น string → math ต้อง `parsePrice()` (อย่า assume เป็นตัวเลข)
- ตะกร้าใช้ **localStorage** ได้ (แอปจริง ไม่ใช่ artifact)
- ส่ง patch ไฟล์ใหญ่ → **upload ไฟล์ `.txt`/`.js` เข้า Codespace ตรง ๆ ดีกว่า copy-paste base64** (base64 placeholder ถูกวางทับบ่อย → ได้ไฟล์เปล่า)
- เช็ค sha256 ก่อนรัน patch เสมอ; ไฟล์เปล่า sha = `e3b0c442...`

**ทั่วไป (จาก phase ก่อน)**
- **Deploy จาก root** (`firebase.json: "public": "."`) ไม่ใช่ `public/`
- **patch มี self-check ในตัว** — anchor ต้องเจอ 1 ครั้ง + marker ต้องครบ + กันรันซ้ำ ไม่งั้น exit ไม่เขียนไฟล์
- รูปแบบ: แก้ → `firebase deploy` → `git add/commit/push` (deploy แยกจาก git)
- รัน `firebase deploy` **เต็ม** เมื่อแก้ rules (ไม่ใช่แค่ `--only hosting`)
- LINE LIFF = 1 channel : 1 endpoint (tenant อื่นที่ใช้ LINE ต้องสร้าง channel/LIFF แยก)
- Firestore Rules ใช้ `signedIn()/isOwner()/isAdmin()`; admin = custom claim `admin==true` จาก `lineAuth`

---

## 📊 สถานะ MVP

1. ✅ LINE Login
2. ✅ Onboarding + Edit Profile
3. ✅ โพสภาพ + พืช + พิกัด
4. ✅ Feed (+ tenant isolation)
5. ✅ AI วิเคราะห์โรคพืช (Gemini Vision)
6. ✅ Like + Comment
7. ✅ Point system
8. ✅ Profile + Badge/Tier
9. 🟡 Community → ใช้ feed กลาง + admin moderation แทนกลุ่มแยก
10. ✅ Multi-tenant SaaS (phuansuan + office) + Admin Panel + Feature Flags
11. ✅ **Commerce — ตะกร้า/PromptPay/ออเดอร์/สินค้าในโพส**

---

## 🔮 ถัดไป (ของเสริม)

- **3.2b** — dropdown ที่อยู่ไล่ระดับ จังหวัด→อำเภอ→ตำบล→เติมรหัสไปรษณีย์อัตโนมัติ (dataset ฟรี) — UX polish
- **3.4b** — แจ้งเตือน LINE OA เมื่อสถานะออเดอร์เปลี่ยน (ต้องเปิด Messaging API + Cloud Function + channel access token)
- **3.5 อัปเกรด** — Shippop (ค่าส่งจริง+จองขนส่ง+เลขพัสดุอัตโนมัติ ผ่าน Cloud Function), EasySlip (ตรวจสลิปอัตโนมัติ กันสลิปซ้ำ/ปลอม)
- **Phase 4** — Template ที่ 2 (สไตล์ IG)
- Auto-deploy (GitHub Actions), server-side tenant filter + composite index เมื่อข้อมูลเยอะ
- **ตั้ง `promptpayId` จริงของ DemeterRich ใน `config.js`** (ถ้ายังไม่ได้ตั้ง — ต้องตั้งก่อนรับเงินจริง)

---

## 🔑 Keys & IDs

| ค่า | ข้อมูล |
|-----|--------|
| LINE Channel ID | 2010356906 |
| LIFF ID | 2010356906-9iRWpDO2 |
| Firebase Project | phuansuan (number: 695339976212) |
| Hosting | https://phuansuan.web.app · https://office-phuansuan.web.app |
| Admin | https://phuansuan.web.app/admin.html |
| Admin LINE ID | U03582167674331d9005dfb42728c7151 |
| Cloud Function | lineAuth @ asia-southeast1 |
| Repo | github.com/rotemaster-crypto/phuansuan |
| Firestore / Storage | asia-east1 / us-east1 (Blaze) |

> ⚠️ ห้ามใส่ LINE Channel Secret / API key ใน repo — เก็บใน Secret Manager / functions config เท่านั้น

---

## 🔧 ไฟล์อ้างอิง
- `index.html` — แอปทั้งหมด (single file, vanilla JS) — รวม commerce 3.1/3.2/3.4a
- `admin.html` — แอดมิน — รวมหน้าจัดการออเดอร์ (3.3)
- `qrcode.js` — ไลบรารีสร้าง QR (bundled, ใช้กับ PromptPay)
- `config.js` — customization layer (tenant/domains/overrides/features/admin/points/crops/products/**shop.commerce**)
- `functions/index.js` — Cloud Functions (lineAuth + custom claim admin, onPostCreated เพิ่มแต้ม)
- `firestore.rules` — signedIn/isOwner/isAdmin (+ `orders`)
- `storage.rules` — posts/covers/app-icons/**slips**
- `firebase.json` — 2 hosting target (main/office)

---

## 📎 ภาคผนวก — Phase 5 (Multi-tenant SaaS, ทำข้ามคิวมาก่อน)

วางรากฐาน **1 codebase + 1 Firebase project** รองรับหลาย tenant แยกด้วย field `tenantId` + ตรวจ tenant จากโดเมน (hostname)
- 2 แอปจาก code ชุดเดียว: `phuansuan` (LINE login) / `office` ("Office Social", anonymous auth, ปิด AI/แจ้งเตือน)
- Tenant isolation (feed/my-posts กรอง client-side เลี่ยง composite index), Admin moderation (ลบ/ปักหมุด), Feature Flags real-time (`settings/{tenantId}` + onSnapshot)
- `config.tenant.domains` + `overrides` (ชื่อ/โลโก้/features ต่อ tenant); `resolveTenant()` ก่อน `applyConfig()`
- office ใช้ anonymous auth เพราะ LINE LIFF endpoint เดียว
