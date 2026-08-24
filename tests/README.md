# tests — Firestore rules tests (tenant isolation)

ทดสอบว่า `firestore.rules` กันข้อมูลข้ามแบรนด์จริง (ความเสี่ยง R1 "จบเกม")

## ต้องมีก่อน
- Node 22+
- Java 11+ (Firestore emulator ต้องใช้)
- Firebase CLI: `npm install -g firebase-tools`

## ติดตั้ง (ครั้งเดียว)
```bash
npm install --prefix tests
```

## รันเทสต์ (จาก repo root)
```bash
firebase emulators:exec --only firestore --project demo-bocean "node --test tests/rules.test.js"
```
- ใช้ project `demo-bocean` (ขึ้นต้น `demo-` = emulator ล้วน ไม่แตะข้อมูลจริงบน cloud)
- คำสั่งนี้จะสตาร์ท emulator → รันเทสต์ → ปิดให้เอง

## เคสที่คุม
- อ่าน/เขียน user, post, order, settings **ข้ามแบรนด์ = ปฏิเสธ**
- guest เขียนไม่ได้ · แก้ points/tier ตัวเองเกินสิทธิ์ = ปฏิเสธ
- สิทธิ์ tenant admin **ไม่ข้ามแบรนด์**
- root path ระดับบนสุด (legacy) ถูกปิดหมดแล้ว

> รันอัตโนมัติทุก push/PR ผ่าน `.github/workflows/rules-test.yml`
