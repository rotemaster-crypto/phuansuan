# 📊 PROGRESS — เพื่อนสวน (Phuansuan App)
> อัพเดตล่าสุด: 10 มิถุนายน 2026

---

## ✅ เสร็จแล้ว

### Infrastructure
- [x] Firebase project สร้างแล้ว (phuansuan — Blaze plan)
- [x] Firestore Database (asia-east1)
- [x] Firebase Storage (us-east1)
- [x] Firebase Hosting (phuansuan.web.app)
- [x] GitHub repo (rotemaster-crypto/phuansuan)
- [x] GitHub Codespaces setup
- [x] Firebase CLI login + init

### Frontend
- [x] UI Template — Facebook Mobile style
- [x] Topbar (ขาว + น้ำเงิน)
- [x] Feed tabs (ทั้งหมด / ติดตาม / ใกล้ฉัน)
- [x] Stories bar
- [x] Create Post box
- [x] Post card + AI box + Product link
- [x] Like / Comment / Share actions
- [x] Comment section (toggle)
- [x] Profile screen (cover + avatar + stats + badge + tier)
- [x] Community screen
- [x] Post Modal (4 ประเภท)
- [x] Bottom nav (5 ปุ่ม)
- [x] Loading screen (spinner)
- [x] Login screen (หน้า login สวยงาม + ปุ่ม LINE สีเขียว)

### Config System
- [x] config.js — ปรับแต่งได้โดยไม่แตะ index.html
- [x] app settings (ชื่อ, สี, โลโก้)
- [x] shop settings (Line OA, Line Shop URL)
- [x] points system config
- [x] tier system config
- [x] crops list (เพิ่ม/ลบได้)
- [x] products list (เพิ่ม/ลบได้)
- [x] diseases + product mapping
- [x] features toggle (เปิด/ปิด)
- [x] notifications config
- [x] badges config

### 🔐 Authentication (Phase 1 — เสร็จแล้ว!)
- [x] LINE Developer account setup
- [x] LINE Login Channel สร้างแล้ว (Channel ID: 2010356906)
- [x] LIFF App สร้างแล้ว (LIFF ID: 2010356906-9iRWpDO2)
- [x] firebase-config.js — Firebase + LIFF config
- [x] LIFF init + LINE Login flow
- [x] Firebase Anonymous Auth เปิดแล้ว
- [x] signInAnonymously() ก่อนเขียน Firestore
- [x] ดึงชื่อ + รูปโปรไฟล์จาก LINE จริง
- [x] บันทึก user ลง Firestore (collection: users)
- [x] Daily login bonus (+5 แต้ม)
- [x] User document มี: displayName, photoUrl, lineUserId, points, tier, crops, postCount, helpCount, createdAt, lastLoginAt

---

## ⏳ กำลังจะทำ — Phase 1 (ต่อ)

### 📝 Posts
- [ ] เชื่อม Firestore — เขียนโพสได้จริง
- [ ] อัพโหลดรูปภาพ → Firebase Storage
- [ ] บันทึกพิกัด GPS กับโพส
- [ ] ดึงโพสจาก Firestore แสดงใน Feed
- [ ] Real-time update

### 👤 Profile (ต่อ)
- [ ] แสดงชื่อ + รูปจริงจาก LINE ใน UI
- [ ] Onboarding screen (เลือกพืชที่ปลูก + พิกัด)
- [ ] Profile แสดงแต้มจริงจาก Firestore

### 📍 Feed
- [ ] Filter โพสตามพิกัด (radius จาก config)
- [ ] Feed "ติดตาม" — เห็นเฉพาะคนที่ follow
- [ ] Pagination (โหลดเพิ่ม)

---

## 🔮 Phase 2 — Engagement

- [ ] AI วิเคราะห์โรคพืช (Gemini Vision API)
- [ ] Like + Comment บันทึกจริงใน Firestore
- [ ] Point system คำนวณอัตโนมัติ
- [ ] pointLogs collection
- [ ] Profile แสดงแต้มจริง
- [ ] Badge คำนวณอัตโนมัติ
- [ ] Follow / Unfollow จริง
- [ ] แจ้งเตือนผ่าน LINE OA

---

## 🌐 Phase 3 — Community

- [ ] Community/กลุ่ม (สร้าง, join, feed แยก)
- [ ] Proximity Alert (แจ้งเตือนโรคระบาดในพื้นที่)
- [ ] เชื่อม LINE Shop — ยืนยันการซื้อ
- [ ] Tier Redeem — ใช้ส่วนลด
- [ ] Dashboard หลังบ้านร้านค้า
- [ ] Security Rules (production-ready)

---

## 🐛 Issues ที่รู้อยู่

| # | ปัญหา | สถานะ |
|---|-------|-------|
| 1 | config.js โหลดไม่ได้ถ้าเปิดจาก file:// | รู้อยู่ — ไม่มีผลบน Firebase Hosting |
| 2 | Storage region เป็น US-EAST1 ไม่ใช่ Asia | แก้ตอน launch จริง |
| 3 | firebase-config.js อยู่ใน GitHub (API key exposed) | ต้องเพิ่มใน .gitignore ก่อน launch |
| 4 | Profile UI ยังแสดงข้อมูล mock (ลุงสมชาย) | แก้ใน Posts phase |
| 5 | LINE Browser cache — ต้อง force reload หลัง deploy | รู้อยู่ |

---

## 📝 Notes & Decisions

| วันที่ | การตัดสินใจ |
|--------|------------|
| มิ.ย. 2026 | เลือก Vanilla JS แทน React เพราะทีมเล็ก |
| มิ.ย. 2026 | Login ผ่าน LINE เท่านั้น ไม่มี email/password |
| มิ.ย. 2026 | ตัด Stories ออกจาก MVP ได้ถ้าจำเป็น |
| มิ.ย. 2026 | Point system ทำ client-side ก่อน Cloud Functions ทีหลัง |
| มิ.ย. 2026 | UI style = Facebook Mobile (กลุ่มเป้าหมายคุ้นเคย) |
| มิ.ย. 2026 | ใช้ Firebase Anonymous Auth แทน Custom Token (ง่ายกว่า ไม่ต้อง Cloud Functions) |
| มิ.ย. 2026 | LINE Login Channel: Developing status — ทดสอบได้เฉพาะ Admin account |

---

## 🔑 Keys & IDs (อย่า commit ขึ้น GitHub)

| ค่า | ข้อมูล |
|-----|--------|
| LINE Channel ID | 2010356906 |
| LIFF ID | 2010356906-9iRWpDO2 |
| LIFF URL | https://liff.line.me/2010356906-9iRWpDO2 |
| Firebase Project | phuansuan |
| Hosting URL | https://phuansuan.web.app |
