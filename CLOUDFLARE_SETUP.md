# Cloudflare + Bocean — Checklist ตั้งค่าโดเมน (สเต็ป-บาย-สเต็ป)

> เป้าหมาย: จด `bocean.com` → เชื่อม Firebase → เปิด **subdomain ทุกร้านอัตโนมัติ** (`brandx.bocean.com`) → เปิดทาง **custom domain แบรนด์** (Cloudflare for SaaS)
>
> **โค้ดฝั่งแอปพร้อมแล้วทั้งหมด** (BYOD + subdomain resolve + path) — เอกสารนี้คืองาน **infra/console** ที่ Roger ทำเอง
> สถาปัตยกรรมอ้างอิง: [[custom-domain-byod]] · tenant resolve อยู่ใน `index.html` `tenantId()`

---

## ภาพรวมสถาปัตยกรรม (เข้าใจก่อนทำ)

```
                          ┌─────────────── Cloudflare (DNS + SSL + proxy) ───────────────┐
ผู้ใช้ →  bocean.com          → (proxied) →  Firebase Hosting [bocean target] = bocean.html (แลนดิ้ง)
         www.bocean.com      → (proxied) →  Firebase Hosting [bocean target]
         brandx.bocean.com   → (proxied) →  Cloudflare Worker (reverse proxy) → Firebase [main] = SPA ร้าน
         (*.bocean.com = wildcard · ทุกร้าน auto)                              client อ่าน host → tid=brandx
```

**ทำไมต้อง Worker สำหรับ `*.bocean.com`:** Firebase Hosting **ปฏิเสธ Host ที่ไม่ได้ add ไว้** → wildcard subdomain ยิงตรง Firebase ไม่ได้ · ต้องมี origin ที่เสิร์ฟ SPA ได้ทุก Host → ใช้ **Cloudflare Worker** (เบาสุด ฟรี ไม่ต้อง GCP เพิ่ม) หรือ Cloud Run

---

## PHASE 1 — จดโดเมน + DNS ที่ Cloudflare

- [ ] **1.1** สมัคร Cloudflare account (ฟรี) → https://dash.cloudflare.com
- [ ] **1.2** จด `bocean.com` ที่ **Cloudflare Registrar** (Dashboard → Domain Registration → Register)
  - ราคาต้นทุน ~350฿/ปี · WHOIS privacy ฟรี
  - ถ้าอยากได้ `.co.th` (Cloudflare ไม่ขาย): จดที่ registrar ไทย (THNIC) แล้วมาต่อ **1.3**
- [ ] **1.3** (เฉพาะกรณีจดที่อื่น) เพิ่มโดเมนเข้า Cloudflare → เปลี่ยน **nameserver** ที่ registrar เดิมมาเป็นของ Cloudflare → รอ propagate (ไม่กี่ชม.)
- [ ] **1.4** ยืนยัน DNS active (Cloudflare แสดง "Active" สีเขียว)

---

## PHASE 2 — เชื่อมโดเมนหลัก (apex + www) เข้า Firebase Hosting

> `bocean.com` + `www.bocean.com` = หน้าแลนดิ้ง (bocean.html · bocean hosting target)

- [ ] **2.1** Firebase Console → Hosting → เลือก site **bocean** → **Add custom domain** → `bocean.com`
- [ ] **2.2** Firebase จะให้ **A record / TXT record** → เอาไปใส่ใน Cloudflare DNS
  - **สำคัญ:** ตอน verify TXT ให้ตั้ง record เป็น **DNS only (สีเทา · ปิด proxy 🟠→⚪)** ก่อน ให้ Firebase ออก cert ได้ · เสร็จแล้วค่อยเปิด proxy กลับ
- [ ] **2.3** ทำซ้ำกับ `www.bocean.com` (หรือตั้ง redirect www→apex ใน Cloudflare Rules)
- [ ] **2.4** Cloudflare SSL/TLS mode = **Full (strict)** (ไม่ใช่ Flexible — กัน redirect loop)
- [ ] **2.5** ทดสอบ: เปิด `https://bocean.com` → เห็นแลนดิ้ง Bocean + 🔒 · แชร์ลิงก์ขึ้นการ์ด OG (มีโลโก้)

---

## PHASE 3 — เปิด wildcard subdomain (`brandx.bocean.com`) — หัวใจ

### 3A. Wildcard SSL (ฟรีจาก Cloudflare)
- [ ] **3.1** Cloudflare → SSL/TLS → Edge Certificates → ยืนยันว่า **Universal SSL** ครอบ `*.bocean.com` แล้ว (ปกติมีให้อัตโนมัติ)
  - ถ้าต้อง 2 ชั้น (`a.b.bocean.com`) ต้องซื้อ Advanced Certificate — **ของเราใช้ชั้นเดียว ไม่ต้อง**

### 3B. Origin ที่เสิร์ฟ SPA ทุก Host — เลือก 1 วิธี

**วิธี A (แนะนำ · เบาสุด): Cloudflare Worker reverse proxy**
- [ ] **3.2** Cloudflare → Workers & Pages → Create Worker → วางสคริปต์:
  ```js
  // brandx.bocean.com/* → proxy ไป Firebase SPA (main) · browser ยังเห็น host = brandx.bocean.com
  export default {
    async fetch(request) {
      const url = new URL(request.url);
      const ORIGIN = "phuansuan.web.app";        // Firebase main hosting (เสิร์ฟ index.html/SPA)
      url.hostname = ORIGIN;
      const req = new Request(url, request);
      req.headers.set("X-Forwarded-Host", new URL(request.url).hostname);  // เก็บ host เดิมไว้ (ให้ ogPreview ใช้)
      return fetch(req);
    }
  };
  ```
- [ ] **3.3** Worker → Triggers → Add Custom Domain / Route = **`*.bocean.com/*`**
- [ ] **3.4** Cloudflare DNS → เพิ่ม record: `*` (wildcard) → ชี้ไปที่ Worker (หรือ AAAA/A dummy `100::`/`192.0.2.1` แบบ **proxied 🟠** แล้วให้ route จับ)

**วิธี B (ทางเลือก): Cloud Run** — deploy container เสิร์ฟ index.html ทุก Host → ชี้ `*.bocean.com` (proxied) มา Cloud Run · ยุ่งกว่า มีค่า compute

- [ ] **3.5** ทดสอบ: เปิด `https://ทดสอบ.bocean.com` → เห็นแอปร้าน + client resolve `tenantId()` = `ทดสอบ` (ดู console/หน้าร้าน)

---

## PHASE 4 — ตั้งค่าฝั่งแอป (ทำใน Bocean admin + Firebase Console)

- [ ] **4.1** เปิด **super-admin** → หน้า "จัดการแบรนด์" → ช่อง **"โดเมนแพลตฟอร์ม"** → ใส่ `bocean.com` → บันทึก
  - เขียน `platform/domains.roots` → client จะ resolve `<sub>.bocean.com` → tid ทันที (ทุกร้าน · ไม่ต้องตั้งต่อร้าน)
- [ ] **4.2** Firebase Console → Authentication → Settings → **Authorized domains** → เพิ่ม `bocean.com`
  - ⚠️ **ข้อจำกัด:** Firebase Auth authorized domains **ไม่รองรับ wildcard** → Google/Facebook OAuth บน `brandx.bocean.com` จะติด (ต้อง add ทีละ subdomain)
  - **แต่ LINE login (หลักของเรา · LIFF + custom token) ไม่ติด** — ทำงานทุก subdomain เพราะใช้ custom token ไม่เช็ค authorized domain
  - แนวทาง: ปล่อยลูกค้า login ผ่าน LINE บน subdomain ได้เลย · ถ้าจะเปิด Google/FB บน subdomain ค่อยจัดการภายหลัง (หรือทำ login รวมที่ `bocean.com`)
- [ ] **4.3** (มีอยู่แล้วในโค้ด) path `bocean.com/brandx` ใช้ได้เป็น fallback ทันทีโดยไม่ต้องรอ subdomain

---

## PHASE 5 — Custom domain แบรนด์ (BYOD) + Cloudflare for SaaS (เฟสรายได้ · ทำภายหลัง)

> แบรนด์เอาโดเมนตัวเอง `www.brandshop.com` มาใช้ · auto-provision SSL = ขายเป็นบริการ/ค่าคอมได้

- [ ] **5.1** Cloudflare → **SSL/TLS → Custom Hostnames** (Cloudflare for SaaS) → เปิดใช้
- [ ] **5.2** ตั้ง **Fallback Origin** = origin ที่เสิร์ฟ SPA (Worker/Firebase)
- [ ] **5.3** เมื่อแบรนด์เพิ่มโดเมนในหน้า "จัดการแบรนด์" (BYOD ที่ทำไว้) → เรียก **Cloudflare API** สร้าง Custom Hostname → Cloudflare ออก SSL อัตโนมัติ
  - งานโค้ด: เพิ่ม callable ยิง Cloudflare API ตอน `addTenantDomain` (agent ทำให้ได้ตอนถึงเฟสนี้)
- [ ] **5.4** แบรนด์ตั้ง CNAME 1 บรรทัดชี้มาหาเรา → ใช้ได้ · เราคิดเงินแพ็กเกจ = กำไร (100 hostname แรกมักฟรี · ตรวจราคาปัจจุบัน)

---

## ✅ Verification (เช็คหลังทำ)

- [ ] `https://bocean.com` → แลนดิ้ง + 🔒 + OG card
- [ ] `https://anybrand.bocean.com` → แอปร้าน `anybrand` (subdomain auto)
- [ ] `https://bocean.com/anybrand` → แอปร้าน `anybrand` (path fallback)
- [ ] `?t=anybrand` → ยังใช้ได้ (explicit)
- [ ] LINE login ทำงานบน subdomain
- [ ] แชร์ `/s/<tid>/p/<id>` ขึ้นการ์ด OG

---

## 💰 สรุปค่าใช้จ่าย (โดยประมาณ)

| รายการ | ค่าใช้จ่าย |
|---|---|
| โดเมน `.com` (Cloudflare Registrar) | ~350฿/ปี (ต้นทุน) |
| DNS + Universal wildcard SSL | **ฟรี** |
| Cloudflare Worker | ฟรี (100k req/วัน) → เกิน ~$5/เดือน |
| Firebase Hosting/Functions | ตาม usage (Blaze) — เดิมมีอยู่แล้ว |
| Cloudflare for SaaS custom hostname | ~100 แรกฟรี · เกินหลักไม่กี่บาท/โดเมน/เดือน |

---

## หมายเหตุสำคัญ
- **ทำ PHASE 1–2 ก่อนก็พอเริ่มได้** (แลนดิ้ง + path routing ใช้ได้ทันที) · subdomain (PHASE 3) ทำเมื่อพร้อม
- **ห้ามใช้ SSL mode = Flexible** (ต้อง Full strict) — กัน redirect loop กับ Firebase
- Worker ORIGIN ชี้ `phuansuan.web.app` (main SPA) ไม่ใช่ bocean target
- เก็บ record ที่ verify Firebase เป็น **DNS-only** ชั่วคราวตอนออก cert แล้วค่อยเปิด proxy
