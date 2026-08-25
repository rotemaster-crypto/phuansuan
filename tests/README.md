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
firebase emulators:exec --only functions,firestore,auth --project demo-bocean \
  "node --test --test-concurrency=1 tests/spin.test.js tests/coupon.test.js"
```
> ⚠️ ต้องมี `--test-concurrency=1` — สองไฟล์ share emulator เดียวกันและใช้ `clearFirestore()` ถ้ารัน parallel จะล้างข้อมูลของกันกลางคัน

### เคสที่คุม
**`spin.test.js` (8) — spinLuckyDraw:**
- **ชนะ** → ได้คูปอง (users/{uid}/coupons) + หักแต้ม + `spins`++
- **ไม่ถูกรางวัล** (prize type `nothing`) → `win:false` ไม่มีคูปอง แต่ยังหักแต้ม
- **สต็อกจำกัด** → `awarded`++ แล้วรอบถัดไป "รางวัลหมด" (ไม่หักแต้มซ้ำ)
- guard: แต้มไม่พอ / กิจกรรมปิด / pool ว่าง → `failed-precondition` · ไม่ส่ง/ผิด `drawId` → `invalid-argument`/`not-found`

**`coupon.test.js` (9) — placeOrderWithCoupon (คูปองใช้จริงตอน checkout):**
- **fixed ฿** / **percent %** → คำนวณส่วนลด server-side ถูกต้อง + สร้าง order + มาร์คคูปอง `used` atomic
- ส่วนลด > ยอด → clamp ไม่ติดลบ · ส่วนลดสมาชิกซ้อนคูปอง (base = subtotal − tier)
- **กันใช้ซ้ำ**: คูปอง `used` แล้ว → `failed-precondition` · คูปองโชว์เฉยๆ (ไม่มี discountType) → ใช้ลดราคาไม่ได้
- guard: couponId ผิด → `not-found` · ไม่ส่ง couponId / ตะกร้าว่าง → `invalid-argument`

> รันอัตโนมัติทุก push/PR ผ่าน `.github/workflows/functions-e2e.yml`
> หมายเหตุ: โค้ดใช้ modular `require("firebase-admin/firestore").FieldValue` (ไม่ใช่ `admin.firestore.FieldValue` แบบ compat) เพราะ namespaced static หายใต้ functions emulator
