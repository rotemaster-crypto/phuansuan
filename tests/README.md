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

---

## e2e สุ่มจับรางวัล (`spin.test.js`)

ทดสอบ **ตรรกะจริงของ Cloud Function `spinLuckyDraw`** (ไม่ใช่แค่ rules) ผ่าน functions + firestore + auth emulator — seed draw+user → เรียก callable จริง → เช็ก side effects

### ติดตั้งเพิ่ม (นอกจาก tests เดิม)
```bash
npm install --prefix tests
npm install --prefix functions   # emulator ต้องโหลดโค้ดฟังก์ชันจาก functions/
```

### รัน (จาก repo root)
```bash
firebase emulators:exec --only functions,firestore,auth --project demo-bocean "node --test tests/spin.test.js"
```

### เคสที่คุม (8)
- **ชนะ** → ได้คูปอง (users/{uid}/coupons) + หักแต้ม + `spins`++
- **ไม่ถูกรางวัล** (prize type `nothing`) → `win:false` ไม่มีคูปอง แต่ยังหักแต้ม
- **สต็อกจำกัด** → `awarded`++ แล้วรอบถัดไป "รางวัลหมด" (ไม่หักแต้มซ้ำ)
- guard: แต้มไม่พอ / กิจกรรมปิด / pool ว่าง → `failed-precondition` (state ไม่เปลี่ยน)
- guard: ไม่ส่ง `drawId` → `invalid-argument` · `drawId` ไม่มีจริง → `not-found`

> รันอัตโนมัติทุก push/PR ผ่าน `.github/workflows/functions-e2e.yml`
> หมายเหตุ: โค้ดใช้ modular `require("firebase-admin/firestore").FieldValue` (ไม่ใช่ `admin.firestore.FieldValue` แบบ compat) เพราะ namespaced static หายใต้ functions emulator
