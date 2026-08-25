# CHECKLIST — resume งาน + เช็กตัวเองกันพลาด

> เปิดมาอ่านไฟล์นี้ก่อนเริ่มทุกครั้ง · คู่กับ [STATUS.md](./STATUS.md) (โค้ดเป็นยังไง) + [ROADMAP.md](./ROADMAP.md) (ทำอะไรต่อ)

---

## 0. อยู่ตรงไหนแล้ว (resume pointer)

- ✅ **Phase 0 ปิดครบ (2026-08-24)** — isolation แน่น: rules-test 15/15 เขียวใน CI, + bocean.web.app landing
- ✅ **Phase 1 ปิดครบ (2026-08-24)** — Community Groups (มี join, คุมต่อแบรนด์) + Badges (ตราสะสม แจกจริง server-side) + จุดไฟชุมชน (seed กลุ่ม/โพสต์ต้อนรับ/ตรา + checklist onboarding) + e2e ร้านผ่าน + toast แทน alert/confirm · rules-test 22/22 · deploy + push ครบ
- ✅ **Phase 2 ปิด (2026-08-25 ตาม scope ที่ตัด):** แปลงราคาเป็นตัวเลข + เครื่องมือต้นทุน–ราคา–margin + icon minimal social ทั้ง 2 แอป · **ผู้ช่วยการตลาด AI = Roger ตัดออก เลื่อนไป Phase 4**
- ✅ **Phase 3 + 3.5 (2026-08-25):** feature flag ต่อแบรนด์ (pricingTool) · ตัดกลุ่ม/ใกล้ฉัน/หมอพืช/crops · **จัดโครง 3 เสา Community/Activity/Market/Profile** · การ์ดร้าน 3 preset · รื้อ Profile (ที่อยู่+ประวัติซื้อ) · de-agri เบา — deploy + verified ครบ
- ▶️ **ถัดไป = Phase 4 Activity Engine** (campaign builder + สุ่มจับรางวัล) · หรือ dogfood/pilot
- ⚠️ ค้าง (ข้อมูล): DemeterRich uncheck "Community Groups" ในแอดมิน (เขียน Firestore เองไม่ได้)
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
