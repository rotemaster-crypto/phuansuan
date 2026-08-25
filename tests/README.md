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
  "node --test --test-concurrency=1 tests/spin.test.js tests/place.test.js tests/cancel.test.js"
```
> ⚠️ ต้องมี `--test-concurrency=1` — ไฟล์เทสต์ share emulator เดียวกันและใช้ `clearFirestore()` ถ้ารัน parallel จะล้างข้อมูลของกันกลางคัน

### เคสที่คุม
**`spin.test.js` (8) — spinLuckyDraw:**
- **ชนะ** → ได้คูปอง (users/{uid}/coupons) + หักแต้ม + `spins`++
- **ไม่ถูกรางวัล** (prize type `nothing`) → `win:false` ไม่มีคูปอง แต่ยังหักแต้ม
- **สต็อกจำกัด** → `awarded`++ แล้วรอบถัดไป "รางวัลหมด" (ไม่หักแต้มซ้ำ)
- guard: แต้มไม่พอ / กิจกรรมปิด / pool ว่าง → `failed-precondition` · ไม่ส่ง/ผิด `drawId` → `invalid-argument`/`not-found`

**`place.test.js` (15) — placeOrder (สร้างออเดอร์ + ตัดสต็อก + ค่าส่ง + คูปอง server-side):**
- **สั่งปกติ** → order + ตัดสต็อก + `soldCount`++ + `stockApplied` · **subtotal คิดจากราคาจริงใน DB** (ไม่เชื่อ client)
- **กันขายเกิน**: สั่งเกินสต็อก / stock 0 / `active:false` → `failed-precondition` (สต็อกไม่ขยับ)
- **สต็อก null (ไม่จำกัด)** → ไม่ตัดสต็อก แต่ soldCount++ · **tier discount** คิดจาก `discountPct` ฝั่ง server
- **ค่าจัดส่ง server-side** (settings/commerce): flat / free / freeOver (ถึง-ไม่ถึงยอด) / weight (กก.แรก+ถัดไป)
- **คูปอง + ตัดสต็อก atomic** · **กันคูปองซ้ำ**: คูปอง `used` แล้ว → ทั้ง tx roll back (สต็อกไม่ถูกตัด) · ตะกร้าว่าง → `invalid-argument`

**`cancel.test.js` (5) — adminCancelOrder (คืนสต็อกตอนยกเลิก):**
- **สิทธิ์**: ไม่ใช่แอดมิน → `permission-denied` (ตั้ง custom claim ผ่าน auth emulator REST)
- **คืนสต็อก**: ยกเลิก → `stock += qty`, `soldCount -= qty`, order = cancelled + `restocked`
- **idempotent**: ยกเลิกซ้ำ → ไม่คืนสต็อกซ้ำ · order เก่า (ไม่ `stockApplied`) → ยกเลิกได้แต่ไม่คืน · stock null → คืนแค่ soldCount

**`mission.test.js` (7) — claimMission (ภารกิจ Phase 4):**
- **progress ฝั่ง server**: points (จาก user.points) / posts (postCount) / purchases (นับออเดอร์ที่จ่ายแล้ว)
- รางวัล **แต้ม** หรือ **คูปอง** (สร้าง coupon จริง) · **กันรับซ้ำ** (missionClaims) · ยังไม่ถึงเป้า/ภารกิจปิด → `failed-precondition`

**`prediction.test.js` (9) — submitPrediction + settlePrediction (ทายผล):**
- **ส่งคำทาย**: entry + entriesCount++ · choice ตัวเลือกผิด → `invalid-argument` · ทายซ้ำ/ปิดรับ/แต้มไม่พอ → `failed-precondition` · หักค่าเข้าร่วม
- **เฉลย (admin)**: ผู้ชนะได้แต้ม/คูปองอัตโนมัติ + entry won/rewarded · **idempotent** (เฉลยซ้ำไม่จ่ายซ้ำ) · ไม่ใช่แอดมิน → `permission-denied`

> รันอัตโนมัติทุก push/PR ผ่าน `.github/workflows/functions-e2e.yml`
> หมายเหตุ: โค้ดใช้ modular `require("firebase-admin/firestore").FieldValue` (ไม่ใช่ `admin.firestore.FieldValue` แบบ compat) เพราะ namespaced static หายใต้ functions emulator
