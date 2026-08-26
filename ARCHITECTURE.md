# ARCHITECTURE.md — เพื่อนสวน / Bocean

> แผนที่ระบบ **ตามที่โค้ดเป็นจริง** (ณ commit `cc50c84`, 2026-08-26). เอกสารนี้เป็น read-only map ของเฟส 0 — บันทึกสิ่งที่เป็น ไม่ใช่สิ่งที่ควรเป็น. จุดที่ไม่ชัด/ขัดแย้ง/ซ้ำซ้อน/อันตราย ติด ⚠️ ไว้ ยังไม่จัดลำดับความรุนแรง (นั่นคือเฟส 2–3).

---

## 0. สรุปทรงระบบใน 5 บรรทัด

- **Monolith ไฟล์เดียวต่อแอป**: `index.html` (4,286 บรรทัด, ลูกค้า) + `admin.html` (3,580, หลังบ้าน) + `functions/index.js` (1,459, backend). ไม่มี framework, ไม่มี build step, ไม่มี module boundary จริง — JS ฝังใน HTML.
- **Firebase ทั้งหมด**: Hosting + Firestore + Auth (LINE LIFF) + Storage + Cloud Functions (v2) + FCM. โปรเจกต์เดียว `phuansuan`, multi-tenant เชิงตรรกะผ่าน path `tenants/{tid}/…`.
- **เส้นแบ่งความปลอดภัยตัวจริงคือ Firestore Security Rules** — client เขียน Firestore ตรงจำนวนมาก, rules คือด่านเดียว.
- **Isolation พึ่ง custom-claims 100%** ไม่มี defense-in-depth; callable บาง endpoint ไม่เช็ค tenant-membership; `resolveTid` fail-open ไปที่ `phuansuan`.
- **มี test + CI สำหรับ backend/rules แล้ว** แต่ **frontend = 0 test**, และ **deploy ไม่ถูก gate ด้วย test**.

---

## 1. โครงสร้างโฟลเดอร์ + หน้าที่

```
phuansuan-main/
├── index.html          4,286 บรรทัด — แอปลูกค้า (community/activity/market) [monolith]
├── admin.html          3,580 บรรทัด — หลังบ้าน super-admin + brand-admin [monolith]
├── bocean.html           481 บรรทัด — landing/สมัครเปิดร้าน (target `bocean`)
├── config.js           window.APP_CONFIG — brand/tenant config, admin lineUserId, promptpay, flags
├── firebase-config.js  FIREBASE_CONFIG (web keys), LIFF_ID, VAPID_KEY  ⚠️ gitignored แต่ committed
├── themes.js           THEME_PRESETS + applyTheme
├── qrcode.js           QR lib (lazy-loaded ตอนเปิด payment modal)
├── firestore.rules     9KB — เส้นแบ่งความปลอดภัยตัวจริง (multi-tenant)
├── storage.rules       กฎ Storage (รูป) — ⚠️ ไม่มี test เลย
├── firebase.json       hosting 3 targets + functions + emulators
├── .firebaserc         project=phuansuan, target→site map
├── sw.js / offline.html / manifest.webmanifest / firebase-messaging-sw.js   — PWA + FCM
├── functions/
│   ├── index.js        1,459 บรรทัด — 14 callables + 11 triggers [monolith]
│   └── package.json     node 22, firebase-admin ^12.1.0, firebase-functions ^5.0.1
├── tests/              node --test บน emulator — backend/rules เท่านั้น (10 ไฟล์)
├── .github/workflows/  firebase-deploy.yml / functions-e2e.yml / rules-test.yml
├── public/             ⚠️ สำเนา index.html/admin.html/config.js/firebase-config.js (ของซ้ำ)
├── icons/              PWA icons
├── apply_*.js          ⚠️ 27 สคริปต์ patch ครั้งเดียว (ขยะ, committed, ถูก deploy ออกเว็บ)
├── package.json        ⚠️ ที่ root — ชื่อ/engines/admin-version เพี้ยนจาก functions/ (ดู §9)
└── *.md                README/ROADMAP/STATUS/RISKS/CHECKLIST/PROGRESS_4/OPERATIONS
```

⚠️ **`public/` มีสำเนาไฟล์หลัก** (`public/index.html` 603 บรรทัด, `public/admin.html` 837, `public/config.js`, `public/firebase-config.js`) — ของจริงที่ deploy คือไฟล์ที่ root (`"public": "."`). ไม่ชัดว่า `public/` ใช้ทำอะไร เป็นซากหรือของที่ยังใช้ → **ต้องยืนยัน**.

---

## 2. Tech stack

| ชั้น | ของจริง | หมายเหตุ |
|---|---|---|
| Frontend | **Vanilla JS** + DOM ตรง (`innerHTML` template literals) | ไม่มี framework/bundler/reactivity — re-render มือ |
| Firebase SDK (client) | **compat v10.12.0** จาก gstatic CDN (app/firestore/auth/storage/functions) | namespaced API |
| Login | **LINE LIFF** (channel `2010356906`) → callable `lineAuth` → custom token | Google/Facebook สำรอง (fb ปิด); anonymous สำหรับ tenant `office` |
| Backend | **Cloud Functions v2** (`onCall` ทั้งหมด, ไม่มี `onRequest`) | region `asia-southeast1`, maxInstances 10, node 22 |
| DB | **Firestore** (rules-based) | tree แขวนใต้ `tenants/{tid}/…` |
| Storage | Firebase Storage | รูป posts/products/slips/covers/banners |
| AI | **Gemini** 1.5-flash via raw `fetch` | key = `defineSecret("GEMINI_API_KEY")` ✅ |
| Shipping | **Shippop** via raw `fetch` (ไม่มี npm client) | ⚠️ baseUrl default = sandbox `.dev` |
| Import | PapaParse + SheetJS/XLSX (ใน admin.html) | Shopee CSV/XLSX |
| PWA/Push | sw.js + FCM + VAPID | manifest ต่อ brand (emoji icon) |

---

## 3. Data flow (ผู้ใช้ → API → DB) และ state อยู่ไหน

### 3.1 ทางเข้า-ออกข้อมูล — **มี 2 ทางปนกัน**

**ทาง A — Cloud Functions (server-authoritative, เชื่อถือได้):** เงิน/สต็อก/รางวัล/แต้มที่จ่ายจริง
- ลูกค้าเรียก: `lineAuth`, `claimTenant`, `analyzePlant`, `spinLuckyDraw`, `submitPrediction`, `claimMission`, `placeOrder`
- แอดมินเรียก: `setCourierCredential`, `createShipment`, `settlePrediction`, `fetchProductMeta`, `shippingBillingSummary`, `setShippingBillStatus`, `adminCancelOrder`

**ทาง B — Client เขียน Firestore ตรง (พึ่ง rules อย่างเดียว):** ⚠️ พื้นผิวเสี่ยงหลัก
- `users/{uid}` create+update — ลูกค้าเขียน `points` + daily-login `increment` **เอง** (index.html:1234,1255)
- `posts` add (ลูกค้าเขียน `authorId` เอง), like/help/comment docs, groups membership
- `orders/{id}.update` — ลูกค้าเซ็ต `status:'paid_review'` + slipUrl **เอง** ไม่มี server verify สลิป (index.html:3962)
- admin: `settings/*`, `products`, `luckyDraws`, `missions`, `earnCampaigns`, `predictions`, `groups`, `users.points/tier/banned`, **`tenants/{tid}.adminLineIds`** (admin.html:3049) — เขียนตรงหมด

> สรุป data flow: **client → (บางส่วน callable) → Firestore** และ **client → Firestore ตรง (ส่วนใหญ่ของ UI)**. Triggers ทำงานหลัง write เพื่อ reconcile แต้ม/counter/แจ้งเตือน.

### 3.2 State เก็บที่ไหน

| ที่เก็บ | อะไร |
|---|---|
| Global vars (index.html) | `currentUser`, `db`, `cart`, `shopProducts`, `checkoutCoupons`, `pendingOrder`, ฯลฯ — mutate ทั่วไฟล์ |
| Global vars (admin.html) | ⚠️ **`currentTenant`** (ตัวเลือก path ของทุก write), `IS_SUPER`, `ADMIN_TENANTS`, `OWNER_TENANTS`, caches |
| localStorage | `phuansuan_cart_<tid>` (ตะกร้า/tenant), `phuan_brand` (branding cache), `pwaInstallDismissed`, `bocean_sender_<tid>` (ใบส่งของ) |
| Firestore realtime (`onSnapshot`) | index.html: notifications, per-post stats, `settings/{features,app,points,shop,commerce,badges}`. admin.html: **ไม่มี listener เลย** — `.get()` ครั้งเดียวล้วน |
| Firestore (server config) | `settings/*` push config เข้า client แบบ live; เศรษฐกิจ (points/coupons/orders) เป็น source of truth |

---

## 4. ขอบเขต module + dependency ระหว่างกัน

> ⚠️ **ไม่มี module จริง** — เป็น monolith 3 ก้อน. ด้านล่างคือ "ส่วนตรรกะภายในก้อน" + เส้น dependency ที่มีจริง.

```
        config.js / firebase-config.js / themes.js   (shared boot config, global window.*)
                 │                │
      ┌──────────┘                └───────────┐
      ▼                                        ▼
  index.html (ลูกค้า)                      admin.html (หลังบ้าน)
   - auth/profile                           - super zone: sysoverview/tenants/bocean/shipbill
   - community (feed/posts/groups)          - brand zone: dashboard/orders/products/shopdecor
   - activity engine (spin/mission/         - activity config/campaigns/predictions
     prediction/earn/coupon)                - appearance/features/points/badges/team
   - market (shop/cart/checkout/orders)          │
   - AI plant doctor                              │
      │                                           │
      └───────────────┬───────────────────────────┘
                      ▼
             Cloud Functions v2 (functions/index.js)   ← ทั้งคู่เรียกผ่าน httpsCallable
                      │
                      ▼
                  Firestore  ◄──── client เขียนตรงด้วย (ทาง B, §3.1) — gated by firestore.rules
                      ▲
                      └──── Firestore triggers (onPostCreated/onOrderConfirmed/…) reconcile
```

**Dependency ที่ผูกกันแน่น (coupling ที่ต้อง sync มือ):** ⚠️
- **ตรรกะราคา/แต้ม 2 ชุด**: client (`index.html:3654,3675`) จำลองสูตร earn-points ของ `onOrderConfirmed` (functions) ให้ตรง "เป๊ะ" — แก้ที่เดียวลืมอีกที่ = ตัวเลขเพี้ยน.
- **Shape ของ config docs** (`settings/*`, `luckyDraws`, `missions`, `predictions`) ถูก "เขียน" โดย admin.html และถูก "อ่านไปจ่ายเงิน" โดย functions — ไม่มี schema กลาง, ผูกกันด้วยความเข้าใจร่วมเท่านั้น.
- **custom-claims** (`tenants/tadmin/towner/admin`) ผลิตที่ `lineAuth` เดียว, ถูกอ่านทั้งใน functions และ firestore.rules — จุดเดียวพังคือพังหมด (§7).

---

## 5. API endpoints ทั้งหมด (functions/index.js)

### 5.1 Callables (14)

| Function | สิ่งที่ทำ | Auth | line |
|---|---|---|---|
| `lineAuth` | LINE token → custom token + claims | ⚠️ **public** (เชื่อ LINE token) | 43 |
| `claimTenant` | ตั้ง claim tenant ให้ผู้ใช้ OAuth | ต้อง login | 114 |
| `spinLuckyDraw` | สุ่มรางวัลฝั่ง server (atomic) | login (⚠️ ไม่เช็ค membership) | 139 |
| `placeOrder` | สร้างออเดอร์ คำนวณราคา/สต็อกใหม่ | login (⚠️ ไม่เช็ค membership) | 253 |
| `adminCancelOrder` | ยกเลิก+คืนสต็อก | admin/tadmin[tid] | 375 |
| `claimMission` | ตรวจภารกิจ+ให้รางวัล | login | 432 |
| `submitPrediction` | ส่งคำทาย หักแต้ม | login | 507 |
| `settlePrediction` | ปิดผล จ่ายผู้ชนะ | admin/tadmin[tid] | 556 |
| `setCourierCredential` | เก็บ key ขนส่งใน `private/courier` | requireAdmin | 636 |
| `createShipment` | จอง Shippop/mock + tracking | requireAdmin | 731 |
| `shippingBillingSummary` | รวมค่าส่งต่อ brand/เดือน | **super only** | 845 |
| `setShippingBillStatus` | mark bill paid/unpaid | super only | 888 |
| `fetchProductMeta` | ดึง OG meta (มี SSRF guard) | requireAdmin | 958 |
| `analyzePlant` | Gemini วิเคราะห์โรคพืช (โควตา 5/วัน) | login | 992 |

### 5.2 Firestore Triggers (11) — auth โดยธรรมชาติ (ทำงานตาม event)

`onPostCreated`(1229), `onCommentCreated`(1262), `onCommentDeleted`(1281), `onLikeWrite`(1303), `onHelpWrite`(1331), `onPostDeleted`(1351), `onGroupMemberWrite`(1362), `onOrderConfirmed`(1375), `onCommentNotify`(1426), `onHelpNotify`(1439), `onTierUpgrade`(1450). tid มาจาก `event.params.tid` (เชื่อถือได้ — เป็นตำแหน่งจริงของ doc).

---

## 6. จุดจัดการ Auth

- **ผลิตตัวตน**: `lineAuth` เดียว — verify LINE token → mint Firebase custom token, `uid = LINE userId`, ฝัง claims `admin`/`tenants`/`tadmin`/`towner` (functions:73,91-93).
- **super-admin**: `token.admin === true` — ให้เฉพาะ **LINE id เดียว hardcoded** `ADMIN_LINE_ID` (functions:19). ⚠️ เปลี่ยนตัวต้องแก้โค้ด+deploy.
- **brand-admin**: `token.tadmin[tid]` / owner `token.towner[tid]` — derive จาก doc `tenants/{tid}` (`ownerLineId==` / `adminLineIds array-contains`).
- **ตรวจสิทธิ์**:
  - functions: `requireAdmin(req,tid)` (628), `requireSuperAdmin` (827), หรือ inline `req.auth.uid`.
  - firestore.rules: `isAdmin()`/`memberOf(t)`/`isTenantAdmin(t)`/`isTenantOwner(t)` — อ่าน claim ล้วน ⚠️ **ไม่มี member-doc lookup สำรอง**.
  - client: `isAdmin()` = เทียบ `currentUser.uid` กับ lineUserId ใน `config.js` ⚠️ **spoof ได้ฝั่ง client**; `refreshManagerFlag()` อ่าน claim จริง (แข็งกว่า).
- ⚠️ **admin.html zone = แค่ CSS class** (`body.is-super`/`.in-brand`) — ผ่าน gate แล้วทุกอย่าง client-trust; ด่านเขียนจริงอยู่ที่ rules เท่านั้น.

---

## 7. จุดจัดการ Config / Secret

- **committed (public โดยตั้งใจ)**: Firebase web `apiKey`, `VAPID_KEY`, `LIFF_ID` ใน `firebase-config.js` — public keys ปกติ **แต่** ไฟล์เขียนหัวว่า "ไม่ commit" และอยู่ใน `.gitignore` ⚠️ ขัดกันเอง (committed จริง + ซ้ำใน `public/`).
- **committed (กึ่งอ่อนไหว)**: PromptPay id `0868834583` + ชื่อร้าน + เบอร์ใน `config.js` — จำเป็นสำหรับ QR ฝั่ง client แต่เป็น payment/PII ในไฟล์ public.
- **secret จริง จัดถูก** ✅: `GEMINI_API_KEY` = Firebase secret; courier key = Firestore `private/courier` (rules `if false`); `sa.json` gitignored + ไม่ track.
- ⚠️ **super-admin identity hardcoded** (functions:19) — single point of trust.
- ⚠️ **Gemini key ต่อใน URL query** (`?key=...`) แทน header — เสี่ยง leak เข้า log ถ้ามีวัน log URL.

---

## 8. Hosting / CI / Test (ของกันพังที่ "มีแล้ว")

- **Hosting 3 targets**, ทั้งหมด `"public": "."` (root = web root):
  - `main` (phuansuan) + `office` (office-phuansuan) → **ไฟล์ชุดเดียวกันเป๊ะ**, ต่างกันแค่ domain override ใน JS.
  - `bocean` → rewrite `**`→`/bocean.html`.
  - ⚠️ `main`/`office` **ไม่ ignore** `admin.html`, `apply_*.js`, `seed_tenant.js`, `tests/**` → **admin หลังบ้าน + สคริปต์ dev ถูก deploy ออกเน็ตสาธารณะ** (`bocean` ignore ครบกว่า).
- **CI 3 ตัว**:
  - `functions-e2e.yml` + `rules-test.yml` — รันบน emulator, fail แล้ว check แดง ✅ (แต่ ⚠️ **`billing.test.js` + `productmeta.test.js` ไม่ถูกรัน** — ไม่อยู่ใน list).
  - ⚠️ `firebase-deploy.yml` — push→main แล้ว **deploy ทันที ไม่มี `needs:`** → **deploy ไม่รอ test ผ่าน** (เว้นแต่มี branch protection ฝั่ง repo ซึ่งมองไม่เห็นในโค้ด).
- **Test inventory**: 10 ไฟล์ backend/rules (spin/place/cancel/mission/prediction/campaign/courier/billing/productmeta/rules). ⚠️ **frontend = 0 test**, **storage.rules = 0 test**.

---

## 9. ⚠️ รายการจุดไม่ชัด / ขัดแย้ง / ซ้ำซ้อน (ยังไม่จัดลำดับ — ไปเฟส 2)

**ความปลอดภัย / isolation (พื้นผิวใหญ่สุด)**
- `resolveTid` **fail-open → `phuansuan`**: tid ผิด/ว่าง/error ไม่ reject แต่ไหลเข้า tenant ธง (functions:28,35) — คลาสเดียวกับบั๊ก data-loss เดิม `201d27c`.
- callable ผู้ใช้ (spin/place/mission/prediction/analyze) **ไม่เช็คว่า uid เป็นสมาชิก tid** — ส่ง `tid` อื่นได้.
- isolation ใน rules พึ่ง claim ล้วน **ไม่มี defense-in-depth** — claim ตั้งผิดครั้งเดียว = เข้าผิด tenant ได้เต็มสิทธิ์.
- **privilege escalation**: `tenants/{tid}.adminLineIds` เขียนตรงจาก client (admin.html:3049), owner-only เป็นแค่ CSS — ถ้า rules ไม่กัน = self-grant admin ได้.
- collection เศรษฐกิจ (`settings`/`products`/`luckyDraws`/`missions`/`earnCampaigns`/`predictions`/`groups`) **`write: if canManage` ไม่มี schema validation** — admin เขียนค่าอะไรก็ได้ แล้ว functions อ่านไปจ่ายเงิน.
- `tenants/{t}` + `settings/*` **world-readable** (`read: if true`) รวม `adminLineIds` — อย่าเก็บของอ่อนไหวตรงนี้.
- `tenantRequests` create **ไม่ต้อง login + ไม่มี rate-limit** — ช่องสแปม.
- **admin.html/apply_*.js ถูก deploy สาธารณะ** (§8) — เปิดพื้นผิวโจมตี/ข้อมูลรั่ว.
- client เชื่อเอง: self-grant points (index.html:1234), order `status:'paid_review'` + สลิปไม่ verify (3962), `?t=` override tenant ได้ (2935).
- XSS: `innerHTML` เยอะ; **URL ไม่ถูก escape** ใน `background-image:url(${..})`/`img src` หลายจุด (index.html:1285,3179,3195,3212; admin.html:2149,2917).
- SSRF guard `isSafePublicUrl` เป็น DNS-blind + ตาม redirect (functions:910,966) — admin-only จำกัดผลอยู่.

**ความสม่ำเสมอ / config**
- ⚠️ **Node version เพี้ยน**: root `package.json` engines `20` vs functions/firebase.json/CI = `22`. root ยังชื่อ `phuansuan-functions` + `firebase-admin ^12.7.0` (functions ใช้ `^12.1.0`) — root package.json เป็นซากงงๆ.
- `.gitignore` ระบุ `apply_*.js`, `firebase-config.js`, `.firebase/`, `seed_tenant.js` **แต่ทุกไฟล์ committed** (ignore ไม่ย้อน untrack) → ignore ไร้ผล.
- `.firebase/hosting..cache` track อยู่ + modified ใน working tree — churn ทุก deploy.

**ซ้ำซ้อน / dead code**
- **สูตรราคา/แต้ม 2 ชุด** (client จำลอง server) ต้อง sync มือ.
- ฟอร์มที่อยู่ซ้ำ 3 ที่ (profile/checkout/order-edit), TH_PROVINCES loop ซ้ำ, login-button show/hide copy-paste.
- CRUD toggle/delete/load ของ luckyDraws/missions/earn/predictions เกือบเหมือนกันเป๊ะ (admin.html), `settings/*` get/set boilerplate ซ้ำ ~15 ครั้ง, default-badges array ซ้ำ 2 ที่.
- `likePost` (index.html:3224) dead code; `ADMIN_LINE_ID` ใน admin.html:1179 dead; `public/` สำเนาไฟล์หลัก (ไม่ชัดว่าใช้ไหม); sample arrays ใน config.js ไม่ใช้แล้ว.
- functions: `require` firestore v2 ซ้ำหลายจุด (1108/1280/1290/1410); 2 trigger บน comment-create event เดียว.

**Scalability**
- `loadSysOverview` (admin.html) fan-out `.get()` N×2 ทุก tenant (users+orders) ไม่มี bound — ไม่ scale.
- `analyzePlant` โควตา TOCTOU (อ่าน-เขียนนอก transaction).
- `loadFeed` `limit(10)` **แล้วค่อย** filter tenant ฝั่ง client — จำนวนโพสต์จริงหล่นต่ำกว่า 10 เงียบๆ.
- admin.html ไม่มี listener — แอดมินหลายคนไม่เห็นกัน ต้อง reload มือ.

**สิ่งที่ต้องยืนยัน (ยังไม่รู้จริง)** ❓
- `public/` ใช้จริงหรือเป็นซาก?
- มี branch protection ฝั่ง GitHub กัน deploy จริงไหม (มองไม่เห็นในโค้ด)?
- Shippop `baseUrl` ต่อ tenant ตั้ง production แล้วหรือยัง (default = sandbox `.dev`)?

---

## 10. บันทึกวิธีทำแผนที่นี้

สังเคราะห์จากการอ่านเต็มไฟล์โดย subagent 5 ตัวขนานกัน: functions/index.js, index.html, admin.html, firestore.rules+storage.rules+tests/rules.test.js, และ config/CI/hosting/tests. ทุก finding มี file:line อ้างอิงในบันทึกเฟส 2 ต่อไป.
