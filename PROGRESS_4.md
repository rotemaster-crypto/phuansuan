# PROGRESS — เพื่อนสวน (Phuansuan) · อัปเดตล่าสุด

> เอกสารต่อเนื่องสำหรับเปลี่ยน chat — อ่านไฟล์นี้ก่อนเริ่มงานต่อ

---

## 1. ภาพรวมโปรเจกต์
- **เพื่อนสวน (Phuansuan)** — เว็บแอปชุมชนเกษตรไทยสไตล์ Facebook ของธุรกิจ **DemeterRich** (ปุ๋ยเหลว)
- กลุ่มเป้าหมาย: ชาวสวน 35–60 ปี · คอนเซปต์: **branding + community + shopping**
- Stack: **Vanilla JS ไฟล์เดียว `index.html`** + Firebase (Hosting/Firestore/Storage/Functions Node20 asia-southeast1) + LINE LIFF + Gemini Vision
- Repo (public): `github.com/rotemaster-crypto/phuansuan` · Live: `phuansuan.web.app` · Project ID: `phuansuan`
- tenant จริง = `phuansuan` (มี tenant ทดสอบ `office`)

## 2. วิธีทำงาน (สำคัญ — ทำตามนี้)
1. Claude clone repo public มาในเครื่องตัวเอง → อ่านโค้ด → เขียน **Node.js patch script** (idempotent: เช็ค anchor ทุกจุด → เขียน → ยืนยัน done sentinel มี / gone sentinel หาย, ถ้าพลาด exit error ไม่เขียนทับครึ่งๆ)
2. **ทดสอบ patch บน fresh clone เสมอ** (verify edits, `node --check` functions, parse client JS ด้วย `vm.Script`, รันซ้ำเช็ค idempotent)
3. ส่งให้ Roger เป็น **heredoc paste-block**: `cat > script.js << 'PHUAN_EOF' … PHUAN_EOF` + `node script.js` → Roger วางใน Codespace (`/workspaces/phuansuan`, branch main) → รัน → `firebase deploy` → commit/push
4. Roger ทดสอบบนมือถือ/แอป ส่ง screenshot
- **กฎ:** เสนอก่อน รออนุมัติก่อน build · อธิบายภาษาไทยเสมอ · แก้ผ่าน config/admin ถ้าทำได้

### บทเรียน patch รอบนี้
- **multiline anchor:** อย่าใช้ `\n` ตรงๆ ใน OLD/NEW (เพี้ยนตอนผ่าน heredoc) → ใช้ `const NL=String.fromCharCode(10)` แล้ว `[...].join(NL)`
- **gone sentinel ต้องเจาะจง** เฉพาะข้อความที่ลบ (อย่าให้ไปตรงกับโค้ดที่ยังอยู่ เช่น `getElementById('x')`)
- ตอนนี้มี **inline `<script>` หลายบล็อก** (เพิ่ม splash script) → เทส parse ต้อง locate บล็อกหลักให้ถูก

---

## 3. ⭐ โครงสถาปัตยกรรมที่เพิ่งค้นพบรอบนี้ (สำคัญที่สุด)

มี **2 แอป** คนละไฟล์:
- **`index.html`** = แอปหลัก (ผู้ใช้ทั่วไป) ที่ `phuansuan.web.app`
- **`admin.html`** (+ `public/admin.html`) = **แดชบอร์ด Admin เต็มตัว** ที่ Roger ใช้จริง (sidebar: Dashboard, Users, โพส, หน้าตา&โลโก้, ไอคอน&รูปภาพ, Content&ข้อความ, Features Toggle, แต้ม&Tier, สินค้า, ออเดอร์)
- `firebase.json` มี 2 hosting target (`main`, `office`) ทั้งคู่ serve จาก `.`

### admin.html เขียน settings ที่ doc ชื่อตายตัว (ไม่มี tenant):
| doc | field สำคัญ |
|---|---|
| `settings/app` | appName, subtitle, logoEmoji, shopName, lineOaId, phone, **primary, accent, grad1, grad2** |
| `settings/features` | แบนราบ boolean: aiDiagnosis, proximityAlert, productLink, stories, pointSystem, communityGroups, weatherAlert, notifNearby/Disease/Comment/Points/Promo |
| `settings/points` | perPost, perPostWithImg, perComment, perHelp, perLike, perPurchase, perAlert, perVerified, dailyLoginBonus, **tierSilver/Gold/Platinum, discSilver/Gold/Platinum** |
| `settings/icons`, `settings/content` | (ยังไม่ได้เจาะลึก) |

### แอปหลัก (index.html) อ่านจากไหน:
- **branding** ← `settings/app` (ผ่าน listener ใน `initFeatureFlags`, map `primary→--primary, accent→--accent, grad1/grad2→prof-cover, appName/logo/subtitle`) ✅ **ต่อแล้ว**
- **features** ← `settings/features` (merge เข้า APP_CONFIG.features) ✅ **ต่อแล้ว**
- **legacy:** ยังมี listener `settings/{tenantId()}` (.branding/.features) — ส่วนใหญ่ว่าง ไม่ขัดกัน
- **points** ← ❌ **ยังไม่ได้ต่อ** (ดู P2)

> ฟังก์ชัน `applyBranding(b)` ใน index.html คือตัว apply กลาง (logo, --primary, --accent, lb-title, tier labels, nav labels, splash + cache localStorage)

---

## 4. เสร็จ + deploy แล้วรอบนี้ (push ขึ้น repo หมด)
- Security (slips/points), like/help/comment ฝั่ง server + ให้แต้มครั้งเดียว (มี marker)
- ลบ mock UI ทั้งหมด (สตอรี่/ค้นหา/แชต/วิดีโอ/favorites/followers/แท็บตาย/badge ปลอม/ชื่อ default ปลอม/กลุ่มชุมชนปลอม)
- 🔔 แจ้งเตือนจริง (Firestore) + ข้อความเป็นไทย
- เมนู ••• เพิ่มเติม (ติดต่อร้าน/ออกจากระบบ)
- **Leaderboard "ปราชญ์ชาวสวน"** (แทนหน้าชุมชนปลอม) + กรองตาม tenant (users ถูกแท็ก tenantId ตอนสมัคร/ล็อกอิน)
- ปุ่มแชร์ทำงานจริง, privacy chip ซื่อตรง, ลบฟังก์ชันตาย
- **ระบบแบรนด์ดิ้ง:** v1 (editor ใน ⚙️ — **ลบทิ้งแล้ว**), v2 (ชื่อ tier ไทย: มือใหม่/เงิน/ทอง/ปราชญ์ + ป้ายแท็บแก้ได้), fix (แอปหลักอ่าน `settings/app`)
- **รีแอคชันหลายอีโมจิ** 👍❤️😆😮😢 (picker + `reactions` map ใน functions, คง likes รวม + แต้มเดิม)
- **ต่อ Features** จาก `settings/features` + **ลบ 🎨 ที่ซ้ำ** ในปุ่ม ⚙️ (เหลือ admin.html ที่เดียว, คง `applyBranding` ไว้)

## 5. ส่งแล้ว รอ Roger รัน/deploy
- **`apply_shop_first.js`** (ส่งล่าสุด ยังไม่ยืนยัน deploy):
  - **#1** splash ตามแบรนด์ (cache ลง localStorage `phuan_brand` → ครั้งถัดไปขึ้นแบรนด์ทันที + early `<script>` หลัง `#loading-screen`)
  - **#2** ร้านค้าเป็นหน้าแรก (default active = `screen-shop`/`nav-shop`, โหลด `loadShop()` ใน `updateUIWithUser`)
  - deploy: `firebase deploy --only hosting`

---

## 6. งานค้าง / ถัดไป

### P2 — แต้ม & Tier (อนุมัติแล้ว ยังไม่ทำ) ⬅️ ทำต่อตัวนี้
ต้องแก้ **2 ฝั่งให้ตรงกัน**:
- **client:** อ่าน `settings/points` → merge `APP_CONFIG.points` (perX) + อัปเดต `APP_CONFIG.tiers[x].min/discount` จาก tierSilver/Gold/Platinum + discSilver/Gold/Platinum
- **functions:** `onPostCreated/onCommentCreated/onLikeWrite/onHelpWrite` ดึงจาก `settings/points` แทน **PTS map ตายตัว** (functions/index.js ~บรรทัด 204: perPost:10, perPostWithImg:15, perComment:3, perHelp:15, perLike:2) — เพิ่ม helper `getPts(db)` อ่าน doc + fallback PTS
- ⚠️ ถ้าทำแค่ client เลขโชว์จะไม่ตรงเลขที่ได้จริง — **ต้องทำคู่กัน**

### #3 — ตกแต่งร้านแบบ Shopee (เสนอแล้ว รอเลือก scope)
เก็บใน `settings/shop` แต่งจาก admin.html · แบ่งเฟส:
- **เฟส A:** แบนเนอร์หัวร้าน (cover+ชื่อ+คำโปรย) + แถบโปรโมชัน
- **เฟส B:** สินค้าแนะนำ (carousel) + การ์ดสไตล์ Shopee (ป้ายลด %, ยอดขาย, badge)
- ตัวเลือกเสริมที่ถามไว้: คูปอง/วอเชอร์, แฟลชเซล → รอ Roger เลือก

### อื่น ๆ ค้าง
- **feature key ไม่ตรง:** admin ใช้ `productLink` แต่แอปใช้ `commerce` — ตัวที่ key ตรงทำงาน, ตัวไม่ตรงต้องจูน
- **เกลารีแอคชัน:** ปุ่มยังไม่จำรีแอคชันตัวเองตอนรีโหลด + สรุปอีโมจิคนอื่นอัปเดตตอนรีเฟรช
- **Node 20 → 22** ก่อน 30 ต.ค. 2026 (functions ขึ้น warning ทุก deploy) + `firebase-functions@latest`
- ทดสอบ flow จริง end-to-end: ร้าน→ตะกร้า→เช็คเอาท์→สลิป→ออเดอร์, AI หมอพืช, onboarding
- **Deferred:** payment gateway (Opn/GB Prime Pay), แจ้งเตือนออเดอร์ LINE-OA (ใช้ Messaging API — LINE Notify ปิดแล้ว), Phase 4 (เทมเพลต UI กลุ่มอายุอื่น/IG), Phase 5 (SaaS หลายร้าน + เก็บเงินรายเดือน)

> หมายเหตุ: `firebase-config.js` อยู่ในรีโป = **ปกติ** (web apiKey เปิดเผยได้; ความปลอดภัยอยู่ที่ Firestore/Storage Rules ที่ล็อกไว้แล้ว)

---

## 7. ไฟล์/ค่าอ้างอิงสำคัญ
- `index.html` (แอปหลัก) · `admin.html` + `public/admin.html` (แดชบอร์ด) · `config.js` (APP_CONFIG: app, tenant, tiers, points, shop, features) · `functions/index.js` (PTS map, awardOnce, onLikeWrite/onHelpWrite/onCommentCreated/onTierUpgrade ฯลฯ) · `firestore.rules` · `storage.rules`
- ฟังก์ชันสำคัญ index.html: `switchScreen` (wrap ให้ shop โหลด `loadShop()`), `updateUIWithUser` (รันหลัง auth ทั้ง 2 ทาง), `initFeatureFlags` (listener settings), `applyBranding`, `loadLeaderboard`, `loadShop/renderProducts`, `saveUserToFirestore` (แท็ก tenantId), `tenantId()`
- deploy: `--only hosting` (index/config) · `--only functions` · `--only firestore:rules` · รวมตามที่แตะ
- LIFF ID `2010356906-9iRWpDO2` · Admin LINE `U03582167674331d9005dfb42728c7151` · PromptPay `0868834583` / DemeterRich · Gemini `gemini-2.5-flash` (Secret Manager) · Codespace `studious-acorn-jjxjvw6v7wg72qw5j.github.dev`
