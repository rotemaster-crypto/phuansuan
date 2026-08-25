# CHECKLIST — resume งาน + เช็กตัวเองกันพลาด

> เปิดมาอ่านไฟล์นี้ก่อนเริ่มทุกครั้ง · คู่กับ [STATUS.md](./STATUS.md) (โค้ดเป็นยังไง) + [ROADMAP.md](./ROADMAP.md) (ทำอะไรต่อ)

---

## 0. อยู่ตรงไหนแล้ว (resume pointer)

- ✅ **Phase 0 ปิดครบ (2026-08-24)** — isolation แน่น: rules-test 15/15 เขียวใน CI, + bocean.web.app landing
- ✅ **Phase 1 ปิดครบ (2026-08-24)** — Community Groups (มี join, คุมต่อแบรนด์) + Badges (ตราสะสม แจกจริง server-side) + จุดไฟชุมชน (seed กลุ่ม/โพสต์ต้อนรับ/ตรา + checklist onboarding) + e2e ร้านผ่าน + toast แทน alert/confirm · rules-test 22/22 · deploy + push ครบ
- ✅ **Phase 2 ปิด (2026-08-25 ตาม scope ที่ตัด):** แปลงราคาเป็นตัวเลข + เครื่องมือต้นทุน–ราคา–margin + icon minimal social ทั้ง 2 แอป · **ผู้ช่วยการตลาด AI = Roger ตัดออก เลื่อนไป Phase 4**
- ✅ **Phase 3 + 3.5 (2026-08-25):** feature flag ต่อแบรนด์ (pricingTool) · ตัดกลุ่ม/ใกล้ฉัน/หมอพืช/crops · **จัดโครง 3 เสา Community/Activity/Market/Profile** · การ์ดร้าน 3 preset · รื้อ Profile (ที่อยู่+ประวัติซื้อ) · de-agri เบา — deploy + verified ครบ
- ✅ **Activity Engine v1 = สุ่มจับรางวัล (2026-08-25):** spinLuckyDraw (server-authoritative) + rules + rules-test 30/30 + admin สร้างกล่องสุ่ม + user แท็บกิจกรรมหมุน+คูปอง — deploy ครบ
- ✅ **e2e สุ่มรางวัลผ่าน emulator (2026-08-25):** `tests/spin.test.js` 8/8 (functions+firestore+auth emulator เรียก callable จริง — ชนะ/nothing/สต็อก/guard ครบ) + CI `functions-e2e.yml` · **จับได้ว่า** โค้ดใช้ namespaced `admin.firestore.FieldValue` ที่หายใต้ functions emulator → migrate ทั้งไฟล์เป็น modular `require("firebase-admin/firestore").FieldValue` (พฤติกรรม prod เท่าเดิม, ปลดล็อก e2e ทุก function) · deploy functions ครบ 14 ตัว (2026-08-25)
- ✅ **คูปองใช้จริงตอน checkout (2026-08-25):** prize มี `discountType`/`discountValue` (฿/%) → คูปองพก field นี้ · `placeOrderWithCoupon` (server สร้าง order + มาร์คคูปอง `used` atomic, คำนวณส่วนลด server-side, กันใช้ซ้ำ) · checkout มี coupon picker + สรุปยอด · "คูปองของฉัน" โชว์ "ใช้แล้ว" · e2e `tests/coupon.test.js` 9/9 (รวม spin = 17/17) · deploy functions+hosting ครบ
- ✅ **admin จัดการสินค้าสไตล์ Shopee + สต็อกอัตโนมัติ (2026-08-25):** ฟอร์มเพิ่มสินค้าแบ่ง 3 หมวด (พื้นฐาน/ราคา&สต็อก/อื่นๆ) + **อัปรูปสินค้า** (Storage `products/{tid}/`, storage.rules ใหม่) + **สต็อกคงเหลือ** + รายการเป็นการ์ดมีรูป+ค้นหา+เปิด/ปิดขาย + edit modal เต็มรูปแบบ · field ใหม่: `image`/`stock`/`active` · **ตัดสต็อกอัตโนมัติ:** รวม order creation เป็น `placeOrder` เดียว (server ตรวจ active+สต็อก, คิด subtotal จากราคา DB, ตัดสต็อก+soldCount+คูปอง atomic กันขายเกิน) แทน client `orders.add`+`placeOrderWithCoupon` · แอปซ่อนสินค้าปิดขาย + โชว์ "สินค้าหมด"/เหลือน้อย + กันใส่ตะกร้าเกินสต็อก · e2e `place.test.js` 10/10 (รวม spin = 18/18) · deploy functions+storage+hosting ครบ
- ✅ **คืนสต็อกตอนยกเลิก + ตั้งค่าจัดส่งแบบ Shopee (2026-08-25):** `adminCancelOrder` (admin-only, คืนสต็อก atomic idempotent, flag `stockApplied`/`restocked` กันคืนซ้ำ/order เก่า) · **ค่าจัดส่งตั้งในแอดมิน** (settings/commerce: โหมด free/flat/weight + **ติ๊กส่งฟรีเมื่อซื้อครบ**) → **placeOrder คิดค่าส่งฝั่ง server** จากน้ำหนัก DB (ไม่มี doc = เชื่อ client legacy) · แอปฟังสด + โชว์ "ซื้ออีก X ส่งฟรี" · e2e `place.test.js`(15)+`cancel.test.js`(5) รวม 28/28 · deploy ครบ
- ✅ **แยก super-admin vs brand-admin (2026-08-25, Roger เลือก "แอปเดียว 2 โหมด"):** จัด sidebar 2 โซน — **[🏢 ระบบ Bocean]** (super เท่านั้น, `.sys-only` toggle ด้วย `body.is-super`: หน้า **ภาพรวมระบบ** รวมสถิติทุกแบรนด์ + จัดการแบรนด์ + คำขอเปิดร้าน) + **[🏪 หลังร้านแบรนด์]** (ออเดอร์/สินค้า/ตกแต่ง/ชุมชน/ตั้งค่าแบรนด์) · super มี **brand switcher (dropdown)** สลับแบรนด์ทุกหน้า · brand-admin ล็อกแบรนด์ตัวเอง ไม่เห็นโซนระบบ · Dashboard เดิม = ภาพรวมร้าน(ต่อแบรนด์) · deploy hosting · **รอ Roger เทสต์ล็อกอินจริง** (super เห็น 2 โซน + สลับแบรนด์ได้, brand-admin เห็นโซนเดียว)
- ✅ **super-admin โฟกัสระบบ + เข้าจัดการแบรนด์เมื่อมีปัญหา (2026-08-25):** super เริ่มที่ "ภาพรวมระบบ" ไม่มีเมนูสินค้า/สุ่มรางวัล/ค่าส่งเป็นของตัวเอง · เลือกแบรนด์จาก dropdown → `enterBrand` เข้าโหมดจัดการ (เห็นเมนูหลังร้านครบ, `body.in-brand`) → "← กลับสู่ระบบ" (`exitBrand`) · brand-admin อยู่ในโหมดแบรนด์เสมอ · icon sidebar เปลี่ยนเป็น SVG feather-style minimal (เพิ่ม symbol grid/building/store/target/users/award ฯลฯ)
- ✅ **Phase 4 = ภารกิจ (Missions) v1 (2026-08-25):** แอดมินสร้างภารกิจ (โพสต์ครบ N / สั่งซื้อครบ N / สะสมแต้มถึง N) รางวัลแต้มหรือคูปอง · `claimMission` (server ตรวจ progress จากตัวนับจริง: points/postCount/จำนวนออเดอร์จ่ายแล้ว, ให้รางวัล+กันรับซ้ำ atomic) · user เห็นภารกิจ+progress bar+ปุ่มรับรางวัลในแท็บกิจกรรม · rules missions/missionClaims · e2e `mission.test.js` 7/7 (รวมทั้งหมด 35/35) · deploy ครบ
- ▶️ **ถัดไป:** ระบบ **ทายผล** (Roger ขอ 2026-08-25 — ทายผลกีฬา/ฉลาก, แอดมินตั้งเงื่อนไขรางวัล, จ่ายรางวัลอัตโนมัติเมื่อเฉลย) · dogfood/pilot
- ✅ **ปิด communityGroups=false ให้ phuansuan แล้ว (2026-08-25):** ผ่าน Firestore REST PATCH (gcloud ใช้ได้แล้ว — ชี้ `CLOUDSDK_PYTHON` ไป python จริง `C:/Users/ACER/AppData/Local/Programs/Python/Python315/python.exe`) · ยืนยัน updateTime ขยับ
- ✅ **บั๊กแอดมินเซฟ — ปิดเคสแล้ว (2026-08-25):** เขียน `settings/features` ต้อง custom claim `admin==true` หรือ `tadmin.phuansuan==true` (rules:37, `canManage`) · อาการเดิม = doc ค้าง 18 มิ.ย. + ขาด field `commerce`/`leaderboard` (พิสูจน์ว่าเซฟไม่เคยลงตั้งแต่ FEAT_MAP เพิ่ม 2 คีย์) — สาเหตุ = token/หน้าแอดมินเก่าค้าง (login flow mint token สดทุกโหลด แต่หน้าเปิดค้างนานเลย claim เพี้ยน) · **แก้:** `saveFeatures()` อ่านกลับมา verify + โชว์ tenant ที่เซฟ + ไม่บังคับ `?? true` (admin.html:1332) → deploy hosting:main,office · **verified:** Roger กดเซฟ → "✅ บันทึกแล้ว → phuansuan" + REST อ่านกลับ `updatedAt`=06:52 วันนี้, `commerce`/`leaderboard`=true เติมครบ
- 🗺️ tenants ทั้งหมด: `phuansuan`(=DemeterRich, ชื่อระบบ "เพื่อนสวน"/appName "เพชรพญา", phuansuan.web.app) · `ecofora` · `phetpaya`
- ⚠️ ค้าง verify: เครื่องมือคิดราคาฝั่งแอดมิน ยัง test สดไม่ได้ (ต้อง login) — Roger ช่วยกดลองในแอดมินจริงเมื่อสะดวก
- รายละเอียดงานย่อย → ROADMAP.md · สถานะฟีเจอร์จริง → STATUS.md

---

## 1. ✅ เปิดงานใหม่ (ทำตามลำดับ)

- [ ] `git pull origin main` — ให้ local ตรง GitHub ก่อนแตะอะไร
- [ ] `git status` = clean (ไม่มีของค้างจากรอบก่อน)
- [ ] อ่าน STATUS.md + ROADMAP.md ว่าค้างตรงไหน
- [ ] ถ้าจะแตะ rules/เทสต์: `npm install --prefix tests` (ครั้งแรกครั้งเดียว)

## 2. ✅ ก่อนแก้โค้ด

- [ ] เข้าใจโค้ดจุดที่จะแก้จริง (อ่านก่อน ไม่เดา)
- [ ] ถ้าจะเขียนทับไฟล์เดิม → **backup ไป `docs/_archive/` ก่อน**
- [ ] แก้ผ่าน `config.js` / admin ถ้าทำได้ (ไม่ต้องแตะ index.html)
- [ ] **ห้ามใช้ `apply_*.js` patch-pile** — แก้ไฟล์ตรงๆ เท่านั้น

## 3. 🔴 ก่อน commit / deploy (กันพลาด — สำคัญสุด)

- [ ] **syntax check** ถ้าแตะ index.html / admin.html:
      `node -e '...vm.Script ต่อ inline <script>...'` (ดู §5) → ต้อง OK ทุกบล็อก
- [ ] **ถ้าแตะ `firestore.rules` → รัน rules-test ให้เขียวก่อน** (§5) — R1 = จบเกม
- [ ] JSON valid ถ้าแตะ `firebase.json`/`.firebaserc`/`config.js`
- [ ] `git diff` ดูว่าแก้เฉพาะที่ตั้งใจ (ไม่มีของแปลกปน)
- [ ] deploy เฉพาะส่วนที่แตะ (`--only hosting:xxx` / `firestore:rules` / `functions`)
- [ ] **หลัง deploy → เทสต์จริงบนเว็บ** ตามเงื่อนไขที่คาด (fail-loud: ถ้าไม่เป็นตามคาด ให้ดังขึ้น อย่าเงียบ)
- [ ] อัปเดต STATUS.md / ROADMAP.md ให้ตรงความจริง
- [ ] `git add` เฉพาะไฟล์ที่ตั้งใจ → commit → `git push origin main`

## 4. 🚫 กฎเหล็ก (ห้ามเด็ดขาด)

- ❌ `git push --force` ทับ history (จะเสียงานคนอื่น/ตัวเอง)
- ❌ deploy โดยไม่เทสต์ rules (ถ้าแตะ rules)
- ❌ fail-silent — ทุก write สำคัญต้องสำเร็จแบบตรวจสอบได้ หรือดังเป็น error
- ❌ query ข้ามแบรนด์นอก `tdb()`/`aDb()`/`troot()` (ทุก path ต้อง tenant-scoped)
- ❌ เทสต์ payment/QR กับ prod (ใช้ emulator / sandbox)
- ❌ rewrite ใหญ่ทั้งไฟล์ — refactor เฉพาะจุดที่แตะ

---

## 5. 📋 คำสั่งที่ใช้บ่อย (รันจาก repo root)

**rules-test (ต้องมี Java 21+):**
```bash
npm install --prefix tests          # ครั้งแรกครั้งเดียว
firebase emulators:exec --only firestore --project demo-bocean "node --test tests/rules.test.js"
```

**syntax check inline JS (index.html / admin.html):**
```bash
node -e 'const fs=require("fs"),vm=require("vm");const h=fs.readFileSync("index.html","utf8");let m,i=0;const re=/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;while((m=re.exec(h))){i++;try{new vm.Script(m[1]);console.log("block #"+i+" OK")}catch(e){console.log("block #"+i+" ERR "+e.message)}}'
```

**deploy (แยกตามที่แตะ):**
```bash
firebase deploy --only hosting:main        # แอปแบรนด์ phuansuan.web.app
firebase deploy --only hosting:bocean      # landing bocean.web.app
firebase deploy --only firestore:rules     # security rules
firebase deploy --only functions           # cloud functions
```

**git sync:**
```bash
git pull origin main        # ก่อนเริ่ม
git push origin main        # หลังเสร็จ (อย่า --force)
gh run list --limit 3       # ดูผล CI
```

---

## 6. 🗺️ แผนที่ระบบ (จำไว้กันหลง)

- **Bocean = แพลตฟอร์ม** · **phuansuan/เพื่อนสวน = 1 tenant** (แบรนด์เราเอง) — คนละระดับ
- **2 แอป:** `index.html` (ผู้ใช้) · `admin.html` (แอดมิน) — ไฟล์เดียว vanilla JS
- **ทุกข้อมูลอยู่ใต้** `tenants/{tid}/...` เข้าถึงผ่าน `tdb()`(client) / `aDb()`(admin) / `troot()`(functions)
- **3 hosting:** main=phuansuan.web.app (แอป), office=office-phuansuan, bocean=bocean.web.app (landing)
- **Firebase project id = `phuansuan`** (ภายใน ไม่เปลี่ยน) · Functions Gen2 nodejs22 asia-southeast1
- **งานเก็บค้าง (ไม่ด่วน):** `firebase-deploy.yml` fail (deploy มือแทน), orphan `public/` + root `index.js`, บั๊ก orphan doc `settings/{tid}` เก่า (ลบได้)
