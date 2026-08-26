# CLAUDE.md — สัญญาพฤติกรรม (เพื่อนสวน / Bocean)

> อ่าน **ก่อนเริ่มทุก feature/แก้ทุกครั้ง** คู่กับ `ARCHITECTURE.md` (แผนที่ระบบจริง)
> และ `AUDIT_FINDINGS.md` (หนี้ที่รู้แล้ว). ไฟล์นี้เป็น "กฎ" — ส่วนที่บังคับได้จริง
> อยู่ใน `tools/guard.mjs` (CI แดงถ้าละเมิด). สั้น กระชับ; ถ้าขัดกับโค้ดจริง ให้แก้เอกสาร

## 0. กฎเหล็ก 3 ข้อ (ทำทุกครั้ง)
1. **ก่อนเขียน feature ใหม่**: อ่าน `ARCHITECTURE.md` + ไฟล์นี้ แล้ว **อธิบายก่อนลงมือ**
   ว่าจะวางตรงไหน เข้ากับโครงเดิมยังไง ข้ามเส้นห้ามข้ามไหม — ห้ามสร้างเสร็จก่อนค่อย audit
2. **เปลี่ยนโครงสร้าง = อัปเดตเอกสาร** (`ARCHITECTURE.md`/ไฟล์นี้) ใน commit เดียวกัน
3. **ก่อน merge**: `node tools/guard.mjs` ผ่าน + e2e/rules test เขียว (CI gate deploy อยู่แล้ว)

---

## 1. หลักสถาปัตยกรรม (ที่ต้องยึด)
- **Firebase ล้วน**: Hosting (static) + Firestore + Auth (LINE LIFF) + Cloud Functions v2
  (`asia-southeast1`) + Storage + FCM. โปรเจกต์เดียว `phuansuan`, multi-tenant เชิงตรรกะ
  ใต้ path `tenants/{tid}/...`
- **Monolith 3 ก้อน** (ตามจริง ยังไม่แตก): `index.html` (ลูกค้า), `admin.html` (หลังบ้าน),
  `functions/index.js` (backend). ไม่มี framework/bundler — JS ฝังใน HTML.
  **อย่ารีบรื้อ**; ถ้าจะแตกไฟล์ ต้องมี test ล้อมก่อน (ดู §6)
- **Server-authoritative สำหรับ เงิน/แต้ม/สิทธิ์**: การเขียนที่มีมูลค่า **ต้องผ่าน Cloud Function**
  ที่ validate แล้ว rules ปิด client เขียนตรง. เส้นแบ่ง:
  - **ผ่าน function + rules ปิด client**: points, order/subtotal/discount, coupon, stock,
    tier, adminLineIds, feature/economy config → ของที่ "โกงแล้วได้เงิน/สิทธิ์"
  - **client เขียนตรงได้ แต่ rules ต้อง validate**: โพสต์/คอมเมนต์/ไลก์/join กลุ่ม, โปรไฟล์
    ตัวเอง (ยกเว้น field เศรษฐกิจ) → ของสังคม latency-sensitive
- **Fail-safe ไม่ fail-open**: error/ค่าไม่ถูกต้อง → **หยุด/throw** ไม่ใช่เดาค่าผ่อนปรน
  (เช่น `resolveTid` throw ไม่ fallback ไป tenant อื่น)

## 2. Data flow & state
- ลูกค้า → callable (เงิน/แต้ม) **หรือ** เขียน Firestore ตรง (สังคม, gated by rules)
- Triggers (`onPostCreated`/`onOrderConfirmed`/...) reconcile แต้ม/counter หลัง write
- tenant มาจาก path เสมอ; ใน callable ใช้ `resolveTid(req.data.tid)` (fail-closed).
  'office' เป็น **client skin** ของ phuansuan (ไม่ใช่ tenant doc จริง) → alias ใน
  `TENANT_ALIASES` เท่านั้น
- config ต่อ tenant อยู่ใน `settings/*` (client อ่าน live); secret จริงอยู่ `private/*`
  (rules ปิด, เข้าผ่าน function) หรือ Firebase Secret (`GEMINI_API_KEY`)

## 3. Convention
- **Callable**: camelCase, เช็ค `req.auth.uid` ก่อน, `resolveTid` เสมอ, งานที่แตะหลาย doc
  ใช้ `runTransaction`, กันซ้ำด้วย marker/flag (`pointsAwarded`/`stockApplied`/claim doc)
- **Firestore config docs**: `settings/{app,features,points,shop,commerce,store,badges,...}`
  หนึ่ง doc ต่อหนึ่งเรื่อง
- **Test**: ทุก callable/rule ใหม่ ต้องมี e2e/rules test บน emulator (ดู `tests/`).
  รูปแบบ harness: ดู `tests/spin.test.js` (functions) / `tests/rules.test.js` (rules)
- **Error ฝั่ง function**: `throw new HttpsError(code, ข้อความไทย)` — อย่ากลืน error เงียบ
- **Error ฝั่ง client**: มี global boundary แล้ว (window error/unhandledrejection → console.error
  ใน index.html). อย่า `catch(e){}` เปล่าบน write path หรือ data loader — write ให้ toast,
  loader ให้ render "โหลดไม่สำเร็จ ลองใหม่" (ห้าม render ว่างเงียบ). แปลง empty-catch เก่า
  เมื่อแตะ loader นั้น (opportunistic)

## 4. ห้ามทำเด็ดขาด (anti-patterns จาก audit — guard.mjs บังคับ)
| กฎ | ห้าม | เพราะ |
|---|---|---|
| **A1** | เอา `cli.discountPct`/ราคา/ส่วนลด จาก client มาใช้ | โกงราคาได้ — คิดฝั่ง server จาก tier จริง |
| **A2** | interpolate URL ดิบ (`url(${obj.x})`, `<img src="${obj.x}">`) | stored-XSS — ห่อ `safeUrl()`/`escapeHtml()` |
| **A4** | `resolveTid` fallback เงียบไป `"phuansuan"` | ข้อมูลไหลผิด tenant — ต้อง throw |
| **A5** | ให้ client เขียน `points/tier/postCount/helpCount/lastBonusDay` ตัวเอง | mint แต้ม — server-only |
| **A6** | callable เศรษฐกิจไม่เช็คว่าเป็นสมาชิก tenant | สั่ง/เล่นข้าม tenant |
| **A8** | `allow read: if true` บน `tenants/{t}` หรือ `settings/store` | รั่ว PII/adminLineIds |
| **A9** | ปล่อย main/office hosting serve `index.js`/`apply_*.js`/`seed_tenant.js` | เผย source/dev script |
| **A10** | `tenantRequests` create โดยไม่ `signedIn()` | สแปม lead |
| **A7** | ให้ deploy โดยไม่ผ่าน test gate | โค้ดพังขึ้น prod |

เพิ่มเติม (guard ยังไม่ครอบ — ให้ระวังตอน review):
- อย่าให้ trigger `onPost*/onLike*` กลืน error เงียบจนแต้ม/counter drift โดยไม่ log
- URL แบบ **ต่อสตริง** (`'url(' + x`) ก็ต้องผ่าน `safeUrl()` (guard จับเฉพาะ template `${}`)
- อย่าเก็บของอ่อนไหวใน `tenants/{t}` หรือ `settings/*` ที่ public (ใช้ `private/*`)
- อย่าแก้ schema ของ config doc (`settings/*`, `luckyDraws`, `missions`...) โดยไม่ดูทั้ง
  ฝั่ง admin (เขียน) และ function (อ่านไปจ่าย) — สอง side ต้องตรงกัน

## 5. รูปแบบที่ต้องใช้
- **State (client)**: global var + re-render มือ (ไม่มี framework). tenant ผ่าน `tenantId()`;
  DB ผ่าน `tdb()` = `tenants/{tenantId()}`
- **Config**: อ่านจาก `settings/*` (live) ทับ `config.js` (default). อย่า hardcode ค่าที่
  ควรตั้งต่อ tenant
- **สิทธิ์**: client `isAdmin()` = แค่ซ่อน/โชว์ UI (spoof ได้) — **การบังคับจริงอยู่ที่ rules +
  claims** (`admin`/`tadmin[t]`/`towner[t]`/`tenants[t]`) เท่านั้น

## 6. หนี้โครงสร้างที่รู้แล้ว (ยังไม่แก้ — ดู AUDIT_FINDINGS.md กอง B)
- claims เป็น isolation ชั้นเดียว (ไม่มี defense-in-depth) — B1
- order lifecycle ไม่มี state machine เจ้าเดียว (admin กระโดด status ได้) — B2
- B5 (บางส่วน): `claimTenant` gate ด้วย origin ∈ `tenant.domains` แล้ว. **ก่อน deploy
  ต้องตั้ง `tenant.domains` ให้ครบทุกโดเมนที่ผู้ใช้เข้าจริง** (web.app + firebaseapp.com +
  custom) ไม่งั้น OAuth join พังจากโดเมนที่ตกหล่น. `lineAuth` ยังไม่ gate (เสี่ยงทำ login
  พังถ้า domains ไม่ครบ; browser vector ปิดด้วย A2 แล้ว). curl ปลอม origin ได้ → **App
  Check คือ closure เต็ม** (ยังไม่ทำ)
- scalability: `loadSysOverview`/dashboard อ่านทั้ง collection, hot-doc campaign — B6/B7/B8
- **frontend test** (B13): มี harness แล้ว (`tests/frontend.test.js` — สกัดฟังก์ชันจริงจาก
  index.html รันใน vm, ครอบ safeUrl/escapeHtml/tenantId). **ครอบเฉพาะ logic/pure fn**;
  DOM-wiring + admin.html ยังไม่ครอบ (ต้อง browser — ยังไม่ทำ). เพิ่ม test ที่นี่เมื่อแตะ
  logic ฝั่ง client
- monolith 4,000 บรรทัด — B15 (แตกไฟล์ต้องล้อม test ก่อน)
- office split-brain (client เขียน `tenants/office`, callable → phuansuan)
- legacy `cli.shippingFee` ยังเชื่อ client เมื่อไม่มี `settings/commerce`

## 7. คำสั่งที่ใช้บ่อย
```
node tools/guard.mjs                 # รั้ว regression (ต้องผ่านก่อน merge)
node --test tests/frontend.test.js   # frontend logic (ไม่ต้อง emulator)
firebase emulators:exec --only functions,firestore,auth --project demo-bocean \
  "node --test --test-concurrency=1 tests/*.test.js"   # e2e (ยกเว้น rules)
firebase emulators:exec --only firestore --project demo-bocean \
  "node --test tests/rules.test.js"                     # rules test
```
