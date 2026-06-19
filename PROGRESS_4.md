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
   - **หมายเหตุ:** Roger download ไฟล์จาก chat ไม่ได้ → **ส่ง heredoc paste-block เป็นหลัก** (copy ทั้งก้อนวาง terminal)
4. Roger ทดสอบบนมือถือ/แอป ส่ง screenshot
- **กฎ:** เสนอก่อน รออนุมัติก่อน build · อธิบายภาษาไทยเสมอ · แก้ผ่าน config/admin ถ้าทำได้

### บทเรียน patch
- **multiline anchor:** อย่าใช้ `\n` ตรงๆ ใน OLD/NEW (เพี้ยนตอนผ่าน heredoc) → ใช้ `const NL=String.fromCharCode(10)` แล้ว `[...].join(NL)`
- **gone sentinel ต้องเจาะจง** เฉพาะข้อความที่ลบ (อย่าให้ไปตรงกับโค้ดที่ยังอยู่)
- มี **inline `<script>` 2 บล็อก** (เพิ่ม splash script) → เทส parse ต้อง locate บล็อกหลักให้ถูก
- **heredoc delimiter:** ใช้ single-quote (`'PHUAN_EOF'`) กัน shell แตะ `$`/backtick/`!` · เช็คก่อนเสมอว่าไม่มีบรรทัดชนกับ delimiter

---

## 3. ⭐ โครงสถาปัตยกรรม (สำคัญที่สุด)

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
- **branding** ← `settings/app` (listener ใน `initFeatureFlags`, map `primary→--primary, accent→--accent, grad1/grad2→prof-cover, appName/logo/subtitle`) ✅
- **features** ← `settings/features` (merge เข้า APP_CONFIG.features) ✅
- **points & tier** ← `settings/points` (listener `applyPoints(d)` → merge `APP_CONFIG.points` + อัปเดต tier min/discount/max + re-render) ✅ **ต่อแล้ว (P2)**
- **legacy:** ยังมี listener `settings/{tenantId()}` (.branding/.features) — ส่วนใหญ่ว่าง ไม่ขัดกัน

> `applyBranding(b)` = apply กลาง branding · `applyPoints(d)` = apply กลาง แต้ม/tier (ทั้งคู่ใน index.html)

---

## 4. เสร็จ + deploy แล้ว (push ขึ้น repo หมด)
- Security (slips/points), like/help/comment ฝั่ง server + ให้แต้มครั้งเดียว (มี marker)
- ลบ mock UI ทั้งหมด · 🔔 แจ้งเตือนจริง (Firestore) ภาษาไทย · เมนู ••• เพิ่มเติม
- **Leaderboard "ปราชญ์ชาวสวน"** + กรองตาม tenant · ปุ่มแชร์จริง · privacy chip ซื่อตรง
- **ระบบแบรนด์ดิ้ง:** ชื่อ tier ไทย (มือใหม่/เงิน/ทอง/ปราชญ์) + ป้ายแท็บแก้ได้ · แอปหลักอ่าน `settings/app`
- **รีแอคชันหลายอีโมจิ** 👍❤️😆😮😢 (picker + `reactions` map ใน functions)
- **ต่อ Features** จาก `settings/features` · ลบ 🎨 ซ้ำในปุ่ม ⚙️
- ✅ **P2 — แต้ม & Tier จาก `settings/points`** (deploy แล้ว 19 มิ.ย. 2026):
  - **client:** listener `settings/points` → `applyPoints(d)` merge `APP_CONFIG.points` (perX) + tier min/discount + คำนวณ max ใหม่ + `updateUIWithUser(currentUser)` real-time
  - **functions:** `getPts(db)` (cache 60 วิ + fallback `PTS`/`TIERS`) ใช้ใน `onPostCreated/onCommentCreated/onLikeWrite/onHelpWrite` · `calcTier(pts, tiers)` + `updateTier(userRef, db)` อ่าน tier threshold จาก settings
  - patch: `apply_points_tier.js` (idempotent) · deploy `--only functions,hosting`
  - ⚠️ รอ Roger ยืนยันเทสต์ end-to-end บนมือถือ (โพสจริง → แต้มที่ได้ตรงเลขที่ตั้งใน admin)

## 5. ส่งแล้ว ยังไม่รัน/deploy
- **`apply_shop_first.js`** (อยู่ใน repo แล้ว แต่ **ยังไม่ได้รัน** → index.html ที่ deploy ยังไม่มีการเปลี่ยนนี้):
  - **#1** splash ตามแบรนด์ (cache `phuan_brand` ลง localStorage + early `<script>` หลัง `#loading-screen`)
  - **#2** ร้านค้าเป็นหน้าแรก (default active = `screen-shop`/`nav-shop`, โหลด `loadShop()` ใน `updateUIWithUser`)
  - ⚠️ ถ้าจะรัน: clone P2 ลงไปแล้ว ต้องเช็ค anchor ยังตรง (P2 แตะ `initFeatureFlags`/`updateUIWithUser` คนละจุด ไม่น่าชน) · deploy `--only hosting`

---

## 6. งานค้าง / ถัดไป

### #3 — ตกแต่งร้านแบบ Shopee (เสนอแล้ว รอเลือก scope) ⬅️ ตัวเลือกถัดไป
เก็บใน `settings/shop` แต่งจาก admin.html · แบ่งเฟส:
- **เฟส A:** แบนเนอร์หัวร้าน (cover+ชื่อ+คำโปรย) + แถบโปรโมชัน
- **เฟส B:** สินค้าแนะนำ (carousel) + การ์ดสไตล์ Shopee (ป้ายลด %, ยอดขาย, badge)
- ตัวเลือกเสริม: คูปอง/วอเชอร์, แฟลชเซล → รอ Roger เลือก

### อื่น ๆ ค้าง
- **รัน `apply_shop_first.js`** (splash แบรนด์ + ร้านหน้าแรก) — ตัดสินใจว่าจะเอาก่อน/หลัง #3
- **feature key ไม่ตรง:** admin ใช้ `productLink` แต่แอปใช้ `commerce` — ตัวที่ key ตรงทำงาน, ตัวไม่ตรงต้องจูน
- **เกลารีแอคชัน:** ปุ่มยังไม่จำรีแอคชันตัวเองตอนรีโหลด + สรุปอีโมจิคนอื่นอัปเดตตอนรีเฟรช
- **Node 20 → 22** ก่อน 30 ต.ค. 2026 (functions ขึ้น warning ทุก deploy) + `firebase-functions@latest`
- ทดสอบ flow จริง end-to-end: ร้าน→ตะกร้า→เช็คเอาท์→สลิป→ออเดอร์, AI หมอพืช, onboarding, **P2 แต้ม/tier**
- **Deferred:** payment gateway (Opn/GB Prime Pay), แจ้งเตือนออเดอร์ LINE-OA (Messaging API), Phase 4 (เทมเพลต UI กลุ่มอายุอื่น/IG), Phase 5 (SaaS หลายร้าน + เก็บเงินรายเดือน)

> หมายเหตุ: `firebase-config.js` อยู่ในรีโป = **ปกติ** (web apiKey เปิดเผยได้; ความปลอดภัยอยู่ที่ Firestore/Storage Rules)

---

## 7. ไฟล์/ค่าอ้างอิงสำคัญ
- `index.html` (แอปหลัก) · `admin.html` + `public/admin.html` (แดชบอร์ด) · `config.js` (APP_CONFIG: app, tenant, tiers, points, shop, features) · `functions/index.js` (PTS/TIERS fallback, **getPts**, awardOnce, onLikeWrite/onHelpWrite/onCommentCreated/onTierUpgrade ฯลฯ) · `firestore.rules` · `storage.rules`
- ฟังก์ชันสำคัญ index.html: `switchScreen`, `updateUIWithUser` (รันหลัง auth ทั้ง 2 ทาง), `initFeatureFlags` (listener settings: features/app/**points**/tenant), `applyBranding`, **`applyPoints`**, `getTier`, `loadLeaderboard`, `loadShop/renderProducts`, `saveUserToFirestore` (แท็ก tenantId), `tenantId()`
- ฟังก์ชันสำคัญ functions/index.js: **`getPts(db)`** (อ่าน `settings/points` + cache), `calcTier(pts,tiers)`, `updateTier(userRef,db)`
- deploy: `--only hosting` (index/config) · `--only functions` · `--only firestore:rules` · รวมตามที่แตะ
- LIFF ID `2010356906-9iRWpDO2` · Admin LINE `U03582167674331d9005dfb42728c7151` · PromptPay `0868834583` / DemeterRich · Gemini `gemini-2.5-flash` (Secret Manager) · Codespace `studious-acorn-jjxjvw6v7wg72qw5j.github.dev`
