# Bocean — หลังบ้านให้แบรนด์คุณทั้งแบรนด์

> แพลตฟอร์ม multi-tenant ที่โรงงานปุ๋ยใช้ "แถม" ให้ลูกค้า OEM ของตัวเอง
> เพื่อให้แต่ละแบรนด์ **สร้างตลาดของตัวเอง (blue ocean)** + มีหลังบ้าน + เครื่องมือการตลาด
> **เพื่อนสวน (Phuansuan / DemeterRich)** = แบรนด์แรกที่รันจริง (reference tenant + dogfood)

📄 อ่านคู่กัน: [STATUS.md](./STATUS.md) (สร้างอะไรจริงบ้าง) · [ROADMAP.md](./ROADMAP.md) (แผนทำให้เสร็จ) · [OPERATIONS.md](./OPERATIONS.md) · [RISKS.md](./RISKS.md)

---

## 1. นี่คืออะไร (และไม่ใช่อะไร)

**Bocean ไม่ใช่ธุรกิจซอฟต์แวร์ — มันคือ "คูเมือง" ของโรงงาน**

- สินค้าจริงที่ขาย = **ปุ๋ย (รับผลิต OEM)** เงินมาจากตรงนั้น
- Bocean = บริการที่ทำให้ลูกค้าโรงงาน **ขายเก่งขึ้น + ไม่ย้ายไปโรงงานอื่น** เพราะย้าย = เสียหลังบ้าน + ชุมชน + ฐานลูกค้าที่สร้างบน Bocean
- **ไม่เก็บเงินลูกค้า** (ตอนนี้) — เป็นบริการ support ลูกค้าโรงงาน ยังไม่เปิดสาธารณะ
- **Flywheel:** ลูกค้าขายได้มากขึ้น → สั่งผลิตกับโรงงานมากขึ้น

**moat ที่ลอกไม่ได้:** เราเป็น *โรงงาน* + **ไม่มี OEM เจ้าไหนซัพพอร์ตลูกค้าด้านนี้** → เป็น moat จากการ *มัดรวม* (โรงงาน + เครื่องมือ) ไม่ใช่จากความเทพของโค้ด ⇒ อย่าลงแรงกับความซับซ้อนของซอฟต์แวร์ ลงแรงกับ *ลูกค้าได้ใช้จริง + มัดรวมเนียน*

**ตัวชี้วัดความสำเร็จที่ถูกต้อง:** ลูกค้าโรงงาน **สั่งซ้ำเพิ่มขึ้น + ไม่หนี** — ไม่ใช่ยอดผู้ใช้ Bocean

---

## 2. โมเดลสองครึ่ง

| ครึ่ง | คืออะไร | สถานะจริง |
|---|---|---|
| **น่านน้ำ (Blue Ocean)** — ทำให้แบรนด์ *โต* | Community + Market + Activity ต่อแบรนด์ | ✅ สร้างจริง ~80% |
| **ฐาน (Enablement)** — ทำให้แบรนด์ *ขายเป็น* | รู้ต้นทุน–ตั้งราคา + ผู้ช่วยการตลาด | 🔴 แทบยังไม่เริ่ม |

> เรากลับหัวสมมติฐานเดิม: ครึ่ง blue ocean เกือบเสร็จและใช้งานได้ ส่วนครึ่งหลังบ้าน (ตัวต่างที่ "ไม่มีใครทำ") ยังเป็น greenfield → ดู [ROADMAP.md](./ROADMAP.md)

---

## 3. กลุ่มเป้าหมาย

- **หลัก — เจ้าของแบรนด์ OEM (ลูกค้าโรงงาน):** ส่วนใหญ่ขาย online, ไม่มีหลังบ้าน, ต้องแข่งในทะเลแดง (ค่า ads แพง แข่งราคา) — Bocean ให้เครื่องมือ + พื้นที่ของตัวเอง
- **ปลายทาง — ลูกค้าของแบรนด์นั้นๆ:** แบรนด์เป็นคนกำหนดเองว่าจับกลุ่มไหน (เดิมตั้งไว้ที่เกษตรกร แต่ยืดหยุ่นตามแบรนด์) — สำคัญ: ชุมชนมีค่าเมื่อแบรนด์ *มีฐานลูกค้าเดิม* มาจัดระเบียบ ไม่ใช่โรงงานหาคนให้

---

## 4. สถาปัตยกรรม (ของจริง)

- **2 แอปไฟล์เดียว:** `index.html` (แอปลูกค้า ~3,285 บรรทัด) · `admin.html` (แผงแอดมิน ~1,780 บรรทัด) · `functions/index.js` (Cloud Functions ~458 บรรทัด)
- **Multi-tenant จริง (server-enforced):** ทุก query วิ่งผ่าน `tenants/{tid}/...` · custom claims ผูกสมาชิกต่อแบรนด์ · `firestore.rules` บังคับ `memberOf(t)` — **แต่ยังไม่มีเทสต์ และมีบั๊ก settings ที่ต้องแก้ก่อนปล่อยลูกค้าจริง** (ดู [RISKS.md](./RISKS.md) R1)
- **Brand Profile:** ตั้งค่าต่อแบรนด์ผ่าน admin → Firestore `settings/*` (ชื่อ/สี/โลโก้/ธีม/คำเรียก/แต้ม/tier/ตกแต่งร้าน)
- **Connector pattern (หลักการ):** ของภายนอกให้เป็นปลั๊กมาตรฐาน — *ตอนนี้ยังไม่ต่อ PMS สด* (เจ้าของโรงงานป้อนข้อมูลราคาเองได้)

---

## 5. Tech Stack

- Frontend: HTML + Vanilla JS + CSS (single-file, ไม่มี framework)
- Backend: Firebase — Firestore, Storage, Hosting, Cloud Functions **Gen2 nodejs22** (`asia-southeast1`), Secret Manager
- Auth: **LINE Login (LIFF)** + guest (anonymous) + Google/Facebook (scaffolding) · FCM push
- AI: Gemini `gemini-2.5-flash` — *ตอนนี้ใช้แค่ "หมอพืช" วิเคราะห์โรคจากรูป*
- Libraries: PapaParse (CSV import สินค้า), qrcode.js (PromptPay QR, bundled)
- Config: `config.js` (brand-agnostic) · Themes: `themes.js` (4 presets)

### Firebase / Deploy
- Project ID: `phuansuan` · Hosting: `phuansuan.web.app`, `bocean.web.app`
- Deploy: `firebase deploy` จาก repo root (`firebase.json` public=".")
- Repo (public): `github.com/rotemaster-crypto/phuansuan` · Dev: GitHub Codespaces

---

## 6. กฎการทำงาน

- **เสนอก่อนเสมอ รออนุมัติ ("อนุมัติ") ก่อน build**
- แก้ผ่าน `config.js` / admin ถ้าทำได้ · code ต้อง `firebase deploy` ได้ทันที · อธิบายภาษาไทยเสมอ
- **เลิก patch-pile** (`apply_*.js` 30+ ไฟล์คือหนี้เทคนิค) → งานใหม่ **แก้ไฟล์ตรงๆ**
- **snapshot baseline สะอาด + เช็ก deployed == repo ก่อนต่อยอด** (กัน divergence)
- **Tenant isolation ต้องมีเทสต์รันใน CI** · **Fail-loud ไม่ fail-silent** (ทุก write สำคัญต้องสำเร็จแบบตรวจสอบได้ หรือดังเป็น error)
- ทุกอย่างที่ค้างครึ่งๆ = **"ทำให้จบ หรือลบทิ้ง"** ห้ามปล่อยครึ่งๆ

---

## 7. ควรมี / ควรตัด (สรุปคำแนะนำ)

**ควรมี (คือเหตุผลที่ต้องเป็นเรา):**
- เครื่องมือ **ต้นทุน–ราคา** (ราคาโรงงาน → margin → ราคาขายแนะนำ) — ตัวต่างหลัก
- **ผู้ช่วยการตลาด** (AI ช่วยเขียนคำโปรย/แคปชัน) — reuse Gemini ที่มีอยู่
- **isolation ที่มีเทสต์** — เงื่อนไขก่อนปล่อยลูกค้าแบรนด์ที่ 2

**ควรตัด/เลื่อน (กันโซโล่จมงาน):**
- Document engine, Reorder autopilot, PMS connector สด, Payment gateway อัตโนมัติ, IG-style templates → **เลื่อนหมด**
- Badges (STUB) + Community groups (flag เปล่า) → **ตัดทิ้งก่อน** ถ้ายังไม่จำเป็น
- Big rewrite → **อย่าทำ** ของเดิม deploy ได้ ให้ refactor เฉพาะตอนแตะไฟล์นั้น
