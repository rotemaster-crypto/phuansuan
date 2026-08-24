# OPERATIONS — ดูแลรักษา + capacity

> ปรัชญา: เป้าไม่ใช่ระบบไร้บั๊ก แต่คือระบบที่ **บั๊กร้ายถูกจับด้วยเครื่องก่อนถึง prod, บั๊กที่หลุดดังขึ้นทันที (ไม่เงียบ), รัศมีความเสียหายถูกจำกัดต่อแบรนด์** — เจ้าของถูกแตะไหล่เฉพาะตอนเงินไม่ตรง/rule แดง

---

## Deploy

- Deploy: `firebase deploy` จาก repo root (`firebase.json` public=".") · แตะอะไร deploy เฉพาะส่วนนั้น (`--only hosting` / `--only functions` / `--only firestore:rules`)
- **ก่อน deploy:** ยืนยัน deployed == repo (กัน divergence — R4)
- **แยก project staging ↔ prod** ก่อนทดสอบ payment/QR จริง (อย่าเทสต์เงินกับ prod)
- Functions = Gen2 **nodejs22** `asia-southeast1` · มี rollback plan เสมอ

## CI/CD (ต่อยอด `.github/workflows` — ตอนนี้ยังไม่มีเทสต์)

รันทุก PR, ไม่ merge ตอนแดง:
1. lint / parse (`node --check` functions, parse client/admin)
2. **rules-test (tenant isolation)** — เคส: A อ่าน/เขียน doc B = denied · guest เขียนไม่ได้ · client แก้แต้ม/tier เองไม่ได้ *(สร้างใน Phase 0)*
3. (ภายหลัง) contract-test เมื่อมี connector ภายนอก

## ดูแลรายวัน/สัปดาห์

- **รายวัน:** ดู order/สลิปค้าง · ดู error log · เช็ก alert fail-loud
- **รายสัปดาห์:** ตรวจ format-drift ของ CSV import · backup ตรวจสอบได้
- **Feature flag ต่อแบรนด์:** เปิดของใหม่ให้ DemeterRich ก่อน → ลูกค้านำร่อง 1 ราย → ทั้งหมด · พังปิดได้ทันทีไม่ต้อง redeploy

---

## Capacity — Firebase รับได้แค่ไหน

### ข้อเท็จจริงทางเทคนิค
- Firestore: **write 1 ครั้ง/document/วินาที** → ระวัง counter ร้อน (leaderboard/แต้ม/like) ตอนสเกลขึ้น → ใช้ distributed counter หรือ aggregate
- Batch write สูงสุด 500 ops (CSV import chunk ปลอดภัยแล้ว)
- Firestore อ่อนเรื่อง report/relational ซับซ้อน → **denormalize สำหรับ dashboard ไว้ล่วงหน้า** อย่ารอจนช้า
- Cloud Functions Gen2 auto-scale แต่ระวัง cold start + concurrency ต่อ instance
- Security Rules ยิ่งซับซ้อนยิ่งกิน eval → ออกแบบให้ตื้น

### ประเมินสำหรับสเกลปัจจุบัน
สเกลหลักสิบแบรนด์ หลักพัน–หมื่น user Firebase รับได้โดยไม่ต้อง re-architect **ถ้าออกแบบ counter/report ถูกตั้งแต่ต้น** · จุดที่ต้องระวังคือ **hotspot counter** (แต้ม/like/leaderboard) ไม่ใช่จำนวน user รวม

> 🟡 ตัวเลขเป้าจริง (จำนวนแบรนด์ / user ต่อแบรนด์ / ออเดอร์ต่อเดือน) — Roger เติมเมื่อชัด เพื่อกำหนดว่าต้อง denormalize เมื่อไหร่

---

## Data hygiene (Firestore ไม่มี schema บังคับ)

- validate ทุก write path (rules หรือ Functions)
- migration แบบ idempotent (backfill field ก่อน deploy query ที่ filter ด้วย field นั้น — ไม่งั้น feed ว่าง)
- **แก้บั๊ก settings path ก่อน** (STATUS.md #2) — เป็นทั้งเรื่อง isolation และ data hygiene
- แยก path รายงานตั้งแต่ต้น
