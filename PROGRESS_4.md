# PROGRESS — เพื่อนสวน (Phuansuan) · อัปเดตล่าสุด (รอบ Shop Decor + Guest Auth + งานค้าง)

> เอกสารต่อเนื่องสำหรับเปลี่ยน chat — อ่านไฟล์นี้ก่อนเริ่มงานต่อ

---

## 1. ภาพรวมโปรเจกต์
- **เพื่อนสวน (Phuansuan)** — เว็บแอปชุมชนเกษตรไทยสไตล์ Facebook ของธุรกิจ **DemeterRich** (ปุ๋ยเหลว)
- กลุ่มเป้าหมาย: ชาวสวน 35–60 ปี · คอนเซปต์: **branding + community + shopping**
- Stack: **Vanilla JS ไฟล์เดียว `index.html`** + Firebase (Hosting/Firestore/Storage/Functions **Gen2 nodejs22** asia-southeast1) + LINE LIFF + Gemini Vision
- Repo (public): `github.com/rotemaster-crypto/phuansuan` · Live: `phuansuan.web.app` · Project ID: `phuansuan`
- tenant จริง = `phuansuan` (มี tenant ทดสอบ `office` ใช้ anonymous auth)

## 2. วิธีทำงาน (สำคัญ — ทำตามนี้)
1. Claude `git clone` repo **สาธารณะ** มาในแซนด์บ็อกซ์ตัวเอง → อ่านโค้ดจริง → เขียน **Node.js patch script** (idempotent: เช็ค anchor → เขียน → ยืนยัน done sentinel)
2. **ทดสอบ patch บน fresh clone เสมอ** (`node --check` functions, parse client/admin ด้วย `vm.Script`, รันซ้ำเช็ค idempotent, ยืนยัน escaping)
3. ส่งเป็น **heredoc paste-block**: `cat > script.js << 'PHUAN_EOF' … PHUAN_EOF` + `node script.js` → Roger วางใน Codespace (`/workspaces/phuansuan`, main) → รัน → `firebase deploy` → commit/push **เอง**
   - **Roger download ไฟล์จาก chat ไม่ได้** → ส่ง heredoc เป็นหลักเสมอ · เช็ค delimiter ไม่ชนก่อนส่ง
4. **Claude ทำงานในระบบจริงแทนไม่ได้** — รัน/deploy/commit ในเครื่อง Roger ไม่ได้ · ที่ทำได้คือ (ก) อ่าน repo สาธารณะผ่าน git clone เพื่อ "ตรวจ GitHub" ว่า commit ขึ้นจริงไหม (ข) เปิดเว็บจริงผ่าน **Claude in Chrome** ส่อง (เบราว์เซอร์ Roger เชื่อมไว้ — Windows "Browser 1")
- **กฎ:** เสนอก่อน รออนุมัติก่อน build · อธิบายภาษาไทยเสมอ · แก้ผ่าน config/admin ถ้าทำได้

### บทเรียน patch (สะสม)
- multiline anchor → `const NL=String.fromCharCode(10)` + `[...].join(NL)` (อย่าใช้ `\n` ตรงๆ)
- substring ชนกันได้ (เช่น weightKg อินเดนต์ต่าง) → anchor 2 บรรทัดให้เจาะจง · ใช้ `replaceAll` เมื่อ key ซ้ำตั้งใจ (เช่น map load+save เหมือนกัน 2 จุด)
- มี inline `<script>` 2 บล็อกใน index.html · admin.html 1 บล็อก → parse ให้ครบ
- escaping `onclick="fn('ID')"` ผ่านหลายชั้น → `\\''+id+'\\'` · `url(\"...\")` → `\\"`
- heredoc delimiter single-quote กัน shell แตะ `$`/backtick/`!`

---

## 3. ⭐ โครงสถาปัตยกรรม (สำคัญที่สุด)

มี **2 แอป** คนละไฟล์ · `firebase.json` ใช้ `"public": "."` → serve จาก **root** (`index.html`, `admin.html` ที่ root คือตัว live · `public/admin.html` เป็นสำเนาเก่าตกค้าง ไม่ใช่ตัวหลัก)
- **`index.html`** = แอปหลัก (ผู้ใช้) ที่ `phuansuan.web.app`
- **`admin.html`** (root) = แดชบอร์ด Admin: Dashboard, Users, โพส, หน้าตา&โลโก้, ไอคอน, Content, Features, แต้ม&Tier, **🛍️ ตกแต่งร้าน**, สินค้า, ออเดอร์

### settings docs (ชื่อตายตัว ไม่มี tenant) — admin เขียน, แอปอ่าน real-time
| doc | field |
|---|---|
| `settings/app` | appName, subtitle, logoEmoji, shopName, lineOaId, phone, primary, accent, grad1, grad2 |
| `settings/features` | aiDiagnosis, proximityAlert, **commerce** (เปิด/ปิดร้าน — ดู §5), stories, pointSystem, communityGroups, weatherAlert, notif* |
| `settings/points` | perPost, perPostWithImg, perComment, perHelp, perLike, perPurchase, perAlert, perVerified, dailyLoginBonus, tierSilver/Gold/Platinum, discSilver/Gold/Platinum |
| `settings/shop` | **(ตกแต่งร้านครบทุกส่วน)** bannerOn, bannerTitle, bannerTagline, coverImage, coverColor1/2, bannerTextColor, bannerHeight, bannerTitleSize, promoOn, promoText, promoIcon, promoBg, promoTextColor, featuredOn, featuredTitle, featCardWidth, discColor, discBg, priceColorOn, priceColor, showSold, shopTitle, shopSub, catBarOn |

### แอปหลักอ่านจากไหน (listener ใน `initFeatureFlags`)
- branding ← `settings/app` (`applyBranding`) ✅
- features ← `settings/features` (`applyFeatureFlags`) ✅ · **ร้านโชว์/ซ่อนคุมด้วย key `commerce`** (`.commerce-entry`)
- แต้ม/tier ← `settings/points` (`applyPoints`) ✅
- ตกแต่งร้าน ← `settings/shop` (`applyShop` ใช้ CSS vars `--shop-disc/--shop-discbg/--shop-price/--feat-w`) ✅

### products (Firestore) — field
ปกติ: name, price (string เช่น "180 บาท"), category, image, weightKg, crops[], diseases[]
เพิ่มรอบนี้: **oldPrice, discountPct, soldCount, badge, featured, description**

---

## 4. ✅ เสร็จ + deploy + push ขึ้น GitHub แล้ว (commit ล่าสุด: Node 22)
**ฐานเดิม:** security, like/help/comment server-side + ให้แต้มครั้งเดียว, แจ้งเตือนจริง, Leaderboard, branding (tier ไทย), รีแอคชันหลายอีโมจิ, commerce (ร้าน/ตะกร้า/เช็คเอาท์/PromptPay/สลิป/ออเดอร์), splash แบรนด์ + ร้านเป็นหน้าแรก

**รอบนี้ (ขึ้นแล้วทั้งหมด ยกเว้นที่ระบุใน §5):**
- **P2 แต้ม & Tier จาก `settings/points`** — client `applyPoints` + functions `getPts(db)` cache 60s + `calcTier(pts,tiers)`/`updateTier(userRef,db)`
- **ตกแต่งร้าน A/B/C:**
  - A: แบนเนอร์หัวร้าน + แถบโปรโมชัน
  - B: การ์ดสไตล์ Shopee (ป้ายลด%/ราคาเดิม/ขายแล้ว/badge) + carousel "🔥 สินค้าแนะนำ" + edit modal ตั้งโปรสินค้าเดิม (admin)
  - C: ปรับได้ทุกส่วน (สี/ขนาด/ข้อความ/เปิดปิด ทุกชิ้น) ผ่าน CSS vars — admin 🛍️ ตกแต่งร้าน 5 การ์ด
- **#1 Banner upload** — admin อัปรูปปกขึ้น Storage `shop-banner/` (rule เพิ่มแล้ว admin write ≤5MB) แล้วใส่ URL อัตโนมัติ
- **#2 หน้ารายละเอียดสินค้า** — กดการ์ด (grid+carousel) → modal: รูปใหญ่/ราคา+ลด%/รายละเอียด/โรค/พืช/ใส่ตะกร้า · เพิ่มฟิลด์ description ใน admin (ฟอร์มเพิ่ม + edit modal)
- **#3 Guest browsing + login gating** — เปิดแอปเป็น guest (anonymous) ดูได้เลย · `requireLogin()`/`isGuest()` gate 6 จุด (openPostModal, submitPost, addComment, setReaction, openAiDoctor, goCheckout) + modal เชิญ login LINE · client-side ล้วน ไม่แตะ rules
- **#4 Responsive desktop** — `@media ≥820px` body 780 + สินค้า 3 คอลัมน์ + feed/ชุมชน/โปรไฟล์คุม 620 กลางจอ · `≥1140px` body 1000 + สินค้า 4 คอลัมน์ · มือถือเหมือนเดิม
- **งานค้าง #2 รีแอคชัน** — `hydrateMyReactions` (จำสถานะปุ่มตอนรีโหลด) + `subscribePostStats` (per-post onSnapshot → likes/emoji/comment count real-time)
- **งานค้าง #3 Node 20→22** — `functions/package.json` engines + `firebase.json` runtime = nodejs22 (Gen2 รองรับ, ไม่แตะโค้ด)

## 5. ⚠️ ส่งแล้ว แต่ยังไม่ได้รัน/push (ต้องเก็บ)
- **งานค้าง #1 — feature key (`commerce`)** ❌ ยังไม่ขึ้น GitHub (`productLink:'feat-product'` เก่ายังอยู่ 2 จุดใน admin.html)
  - **ปัญหา:** toggle "🛒 Product Link" ใน admin เขียน key `productLink` แต่แอปคุมการแสดงร้านด้วย `commerce` → กดปิด/เปิดร้านจาก admin ไม่มีผล
  - **patch ที่ส่งแล้ว** (`apply_fix_featurekey.js`): admin relabel เป็น "🛒 ร้านค้า (Commerce)" + repoint map (load/save) `productLink:'feat-product'`→`commerce:'feat-product'` (2 จุด) · index.html เพิ่ม `commerce: 'ร้านค้า'` ใน FEATURE_LABELS
  - **Roger ต้องรัน heredoc + `firebase deploy --only hosting` + commit/push** แล้วตรวจ GitHub ว่า `commerce:'feat-product'` ขึ้น

---

## 6. งานค้าง / ถัดไป
- **ทดสอบ end-to-end จริง** — ร้าน→ตะกร้า→เช็คเอาท์→สลิป→ออเดอร์ / AI หมอพืช / guest→login / รีแอคชัน real-time / ปิดร้านจาก admin (หลังรัน #1)
- **ของใหญ่ deferred:**
  - Payment gateway (Opn / GB Prime Pay) — ตอนนี้ PromptPay QR + อัปสลิปเอง
  - แจ้งเตือนออเดอร์ผ่าน **LINE-OA** (Messaging API)
  - **Phase 4** — เทมเพลต UI กลุ่มอายุอื่น (IG-style)
  - **Phase 5** — multi-tenant SaaS + เก็บเงินรายเดือน

> หมายเหตุ: `firebase-config.js` ใน repo = ปกติ (web apiKey เปิดเผยได้; ความปลอดภัยอยู่ที่ Rules) · เกล็ดความรู้: anonymous = `signedIn()` → guest อ่าน feed/products ได้ (posts read `if signedIn()`, products read `if true`) แต่ gate การเขียนเป็น client-side

---

## 7. ไฟล์/ฟังก์ชันสำคัญ
- **index.html** ฟังก์ชันหลัก: `switchScreen`, `updateUIWithUser`, `initFeatureFlags` (listener app/features/points/shop/tenant), `applyBranding`, `applyPoints`, **`applyShop`**, `loadShop`/`renderProducts`/`renderFeatured`/`discPct`, **`openProduct`/`closeProduct`** (รายละเอียดสินค้า), `loadFeed`/`renderPost`, รีแอคชัน: `setReaction`/`setReactBtn`/`reactionEmojis`/**`hydrateMyReactions`**/**`subscribePostStats`**/`updatePostStats`, auth: init guest (`signInAnonymously`)/**`isGuest`/`requireLogin`/`showLoginPrompt`**, `tenantId`
- **admin.html**: `showScreen`, save/load ของแต่ละ section → `settings/*` · `saveShopDecor`/`loadShopDecor` (settings/shop), **`uploadShopBanner`** (Storage shop-banner/), `addProduct`/`editProductB`/`saveProdB` (มี description), `saveFeatures` (map → ต้องแก้เป็น commerce ตาม §5)
- **functions/index.js** (Gen2 nodejs22): `getPts(db)`, `calcTier(pts,tiers)`, `updateTier(userRef,db)`, awardOnce, onPostCreated/onCommentCreated/onLikeWrite/onHelpWrite/onCommentNotify, lineAuth(onCall)/analyzePlant(onCall) · deps: firebase-functions ^5.0.1, firebase-admin ^12.1.0
- **firestore.rules**: posts read `if signedIn()`, create `signedIn()&&authorId==uid` · products read `if true` · `settings/{doc}` read public/write admin · orders signedIn
- **storage.rules**: app-icons/ + **shop-banner/** (admin write, isImage, ≤5MB) + catch-all deny
- deploy: `--only hosting` (index/admin/config/storage rules ก็รวม storage) · `--only functions` (Node22) · รวมตามที่แตะ
- LIFF `2010356906-9iRWpDO2` · Admin LINE `U03582167674331d9005dfb42728c7151` · PromptPay `0868834583`/DemeterRich · Gemini `gemini-2.5-flash` (Secret Manager) · Codespace `studious-acorn-jjxjvw6v7wg72qw5j.github.dev`

---

## 8. รอบ Bocean (Platform) — multi-tenant SaaS

> **ชื่อระบบทางการ = Bocean** · แพลตฟอร์มให้แบรนด์ใดก็ได้สร้าง community + ร้านค้า + gamification ของตัวเอง · **เพื่อนสวน = tenant ตัวอย่างตัวแรก**

### สิ่งที่ build + ส่งรอบนี้ (heredoc ส่งแล้ว — Roger ต้องรัน + deploy + push)
- **`bocean.html`** (ไฟล์ใหม่) — landing page แพลตฟอร์ม Bocean (hero/ฟีเจอร์/case study เพื่อนสวน/แพ็กเกจ free-pro-enterprise) + **ฟอร์มขอเปิดร้าน** เขียนลง Firestore `tenantRequests` (ไม่ต้อง login) + ปุ่มคุย LINE สำรอง · โหลด firebase-config.js + SDK 10.12.0
- **`firestore.rules`** — เพิ่ม `match /tenantRequests/{reqId}`: create สาธารณะ + validate (status='new', brandName/contactName/phone เป็น string ความยาวจำกัด) · read/update/delete = `isAdmin()` เท่านั้น · catch-all เดิมคงอยู่
- **`admin.html`** (Super Admin) — เมนูใหม่หมวด **Bocean → "📨 คำขอเปิดร้าน"** + badge นับคำขอใหม่ · screen `#screen-bocean` · `loadBoceanRequests`/`renderBoceanRequests`/`boceanCardHtml`/`setBoceanStatus` (สถานะ ใหม่/ติดต่อแล้ว/อนุมัติ/ปฏิเสธ) · เพิ่มใน loaders map + preload badge ใน Promise.all · reuse CSS oa-* เดิม
- **`index.html`** — เมนู ••• เพิ่มลิงก์ "🚀 เปิดร้านแบรนด์คุณกับ Bocean" → `/bocean.html`
- **deploy:** `firebase deploy --only hosting,firestore:rules`
- ทดสอบบน fresh clone ผ่านครบ: idempotent + parse admin/bocean JS + rules วงเล็บสมดุล 32/32 + marker ครบ

### admin 2 ระดับ (สถาปัตยกรรม)
- **Super Admin** = เจ้าของ Bocean (Roger) — อนุมัติ tenantRequests, provision, billing · รอบนี้ทำส่วน "คำขอเปิดร้าน" แบบเบาก่อน
- **Tenant Admin** = เจ้าของแต่ละแบรนด์ — คือ `admin.html` ปัจจุบัน แต่ยังเขียน path ตายตัว (`settings/app|features|points`) = ยัง single-tenant · ต้อง namespace ใน Phase 5.1

### พิมพ์เขียว Phase 5.1 — migration multi-tenant (BLUEPRINT, ยังไม่ลงมือ)
- ย้าย Pool model (collection รวม แท็ก tenantId) → **Bridge model `tenants/{tid}/...`** (ฐานเดียว) แบบ **copy additive** (ของเก่าอยู่ครบ rollback ได้)
- path ใหม่: `tenants/{tid}/{users|posts|products|orders|notifications|settings}/...` · `tenantRequests` คงเป็น platform-level
- **blocker ต้องเคลียร์ก่อน:** ออกแบบ tenant claim รวมกรณี **anonymous (`office`)** ที่ไม่มี claim จาก lineAuth
- ลำดับ: 5.1a (claim + migrate + verify) → 5.1b (refactor functions→index→admin + rules ใหม่ + dual-read) → 5.1c (cleanup) → 5.1d (provision อัตโนมัติจาก tenantRequests + admin เลือก tenant)
- migration script: Admin SDK + idempotent + recurse subcol + DRY_RUN · backup ด้วย `gcloud firestore export` ก่อนเสมอ
- (พิมพ์เขียวเต็มอยู่ในไฟล์ PHASE5_MIGRATION_BLUEPRINT.md ที่ Claude ร่างไว้ — ส่งเป็น heredoc เข้า repo ได้ถ้าต้องการ)

### ค้าง ณ สิ้นรอบนี้ (ต้องเก็บ)
1. **Bocean** — Roger รัน 3 paste-block + `firebase deploy --only hosting,firestore:rules` + push → ทดสอบ: เปิด `phuansuan.web.app/bocean.html` กรอกฟอร์ม → เช็ค admin "📨 คำขอเปิดร้าน" ขึ้น
2. **feature key `commerce`** (§5 เดิม) — ยังไม่ได้รัน `apply_fix_featurekey.js` → toggle ปิด/เปิดร้าน admin ยังไม่มีผลจนกว่าจะรัน
3. README.md — อัปเดตเป็น overview เต็มแล้ว (รอบนี้)
