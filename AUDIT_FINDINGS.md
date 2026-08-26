# AUDIT_FINDINGS.md — เพื่อนสวน / Bocean

> เฟส 2 (read-only). รวม + dedup จาก auditor 6 ด้าน. ทุก finding ยืนยันกับโค้ดจริง file:line.
> จัด 2 กองตามคำสั่ง: **A = FIX-NOW (ประตูเปิดอยู่บนของ live)** · **B = FIX-WITH-PLAN (โครงสร้าง)**.
> 🔴 อันตรายเชิงโครงสร้าง · 🟠 หนี้โครงสร้าง · 🎨 สไตล์. ระดับ: Critical/High/Medium/Low.
> commit ฐาน: `cc50c84` (2026-08-26).

---

## สรุปผู้บริหาร

- **บั๊กเงินตัวจริง (Critical): `discountPct`** — `placeOrder` เชื่อ % ส่วนลดจาก client → ใครก็ลด 90% ทุกออเดอร์ได้ ทำลายทั้ง design "server-authoritative" ที่อุตส่าห์ทำ. ยืนยันซ้ำโดย 3 auditor.
- **top-3 door-open ยุบเหลือ 2 ราก** ตามที่คุยกัน: **ราก A** (client ถูกไว้ใจเขียน DB เงิน/แต้ม/สิทธิ์) → SEC-1/2/4, DAT-2/3. **ราก B** (fail-open) → ISO-1. **+ C** (CI ไม่ gate deploy).
- **หักล้าง 4 ข้อ ไม่ปั่น**: adminLineIds privesc (rules กันแล้ว), self-confirm points farm (rules กัน), loadFeed cross-tenant (เก็บแยก path), client isAdmin() write (canManage กัน). admin.html public = **แค่ recon ไม่มี secret** (downgrade เป็น Low).
- **serious แต่ไม่ catastrophic แก้ได้หมด**. งานหนักจริงคือ scalability 2 ตัว (จะพังเมื่อโต) + monolith/test (หนี้ยาว).

---

# กอง A — FIX-NOW (ประตูเปิดอยู่ตอนนี้)

> exploitable บนของ live วันนี้ (เงินหาย / ยึดบัญชี / ข้อมูลเสีย / PII รั่ว) หรือแก้ถูกมากคุ้มมาก. ถ้าระบบ live ควรทำกลุ่มนี้ก่อนเดินครบเฟส.

### A1 · `placeOrder` เชื่อ `discountPct` จาก client (ลด 90% ทุกออเดอร์) 🔴 Critical
- **ที่มา**: SEC-1 = DAT-1 = CI-2 (ยืนยัน 3 ด้าน)
- **Files**: `functions/index.js:273,317,333,353` · client ส่งที่ `index.html:3908`
- **Blast radius**: ทุก brand. server คำนวณ subtotal/stock/coupon ใหม่ถูก แต่ `tierPct` เอามาจาก `cli.discountPct` ตรงๆ clamp แค่ 0–90 ไม่เคยอ่าน tier จริงของ user. `promptpayAmount` = ยอดปลอม.
- **Impact**: ยิง payload `discountPct:90` จ่าย 10% ทุกตะกร้า (สิทธิ์จริง max platinum = 15%), stack กับ coupon จริง → เกือบศูนย์. แอดมินเห็นสลิปตรงยอด. เงินหายจริง ซ้ำได้ ทุก tenant.
- **Fix**: อ่าน `users/{uid}` ใน transaction, map `tier`→% จาก `settings/points`/commerce ฝั่ง server, **ทิ้ง `cli.discountPct`**. + ฆ่า legacy `cli.shippingFee` (functions:315) ที่เชื่อ client ตอนไม่มี `settings/commerce`.

### A2 · Stored XSS — URL ไม่ escape ใน feed/leaderboard 🔴 Critical
- **ที่มา**: SEC-2
- **Files**: `index.html:3179` (`authorPhoto`→`background-image:url()`), `:3195` (`<img src=${imageUrl}>`), `:1657` (leaderboard `photoUrl`). (จุดที่ปลอดภัยแล้ว: shop products + admin ใช้ escapeHtml — เทียบได้)
- **Blast radius**: ค่าทั้ง 3 เขียนได้โดยสมาชิกทั่วไป (posts create rule เช็คแค่ authorId+member ไม่ validate field; users update ตั้ง photoUrl ตัวเองได้). `x"><img src=y onerror=...>` แตกออกจาก attribute รันได้.
- **Impact**: สมาชิกคนเดียวฝัง JS รันในทุก session ที่เปิด feed/leaderboard → ขโมย token/ทำแทน/worm. แอดมินที่เปิดดูก็โดน (same origin).
- **Fix**: `escapeHtml()` ทุก URL ที่ interpolate (แบบที่ shop/admin ทำแล้ว) หรือ set ผ่าน `.src`/`.style` property + validate scheme `https:` ตอนเขียน.

### A3 · Post สร้าง/ลบ วน = farm แต้ม+tier ไม่จำกัด 🔴 Critical
- **ที่มา**: DAT-2
- **Files**: `functions/index.js:1229-1258` (`onPostCreated` ให้แต้ม+postCount) vs `:1351-1359` (`onPostDeleted` ลดแค่ `group.postCount` **ไม่คืน** points/user.postCount); ลบได้ที่ `firestore.rules:80`
- **Impact**: สร้าง(+10/15,+postCount,fire tier)→ลบ→วน. แต้มไม่จำกัด, auto platinum, ผ่าน mission "posts" ทันที (claimMission อ่าน postCount ที่ขึ้นอย่างเดียว). ป้อน A1/prediction ต่อ.
- **Fix**: `onPostDeleted` ลด `user.postCount` + คืนแต้มที่เคยให้ (เก็บ `pointsAwarded` บน post ตอนสร้างแล้วลบออกเป๊ะ) + `updateTier`.

### A4 · `resolveTid` fail-open → เขียนผิด tenant (cached 60s) 🔴 Critical
- **ที่มา**: ISO-1 (โยง ISO-3)
- **Files**: `functions/index.js:23-36`, สืบทอดโดย 13 callables
- **Blast radius**: `try{get(tenants/x)}catch{ok=false}` → error ชั่วคราวแยกไม่ออกจาก "tenant ไม่มี" ทั้งคู่คืน `"phuansuan"` **และ cache ผลจาก exception 60s**.
- **Impact**: Firestore สะดุดแวบเดียว → user ของ tenant `acme` ได้ `tid=phuansuan` → แต้ม/coupon/order ลงร้านธง, `lineAuth` ยัง mint claim `{phuansuan:true}` ให้ด้วย. ข้อมูลข้าม tenant เงียบๆ ไม่มี error. = ตระกูลบั๊ก data-loss เดิม `201d27c`.
- **Fix**: error → **`throw HttpsError('unavailable')` (fail-closed)** ไม่ fallback, ไม่ cache ค่าจาก exception.

### A5 · Client mint แต้มตัวเอง +20/write ไม่จำกัดจำนวนครั้ง 🔴 High
- **ที่มา**: SEC-4 = DAT-3
- **Files**: `firestore.rules:62-66` (clamp `points<=old+20 && >=old`); client `index.html:1255`
- **Blast radius**: rule จำกัด **ขนาดต่อ write** แต่ rules จำกัดจำนวน write ไม่ได้. `isNewDay` เช็คฝั่ง client เท่านั้น. สคริปต์ยิง `update({points:increment(20)})` วนได้ไม่จำกัด.
- **Impact**: แต้มไม่จำกัด → spin/prediction/mission/tier. daily-login เป็น cosmetic ไม่ใช่ boundary.
- **Fix**: ห้าม client เขียน `points` เลย (rules `hasOnly([...])` ตัด points/postCount/helpCount/tier ออก) — ย้าย daily-login ไป callable idempotent ต่อวัน.

### A6 · `placeOrder` ไม่เช็ค membership + ตัด stock ตอนยังไม่จ่าย → DoS สินค้า ข้าม tenant 🔴 High
- **ที่มา**: SEC-3 (โยง callable-membership)
- **Files**: `functions/index.js:253-364` (ไม่เช็ค user-doc; `:360-363` ตัด stock ตอน `pending_payment`). เทียบ spin/mission/prediction ที่ **เช็ค** `users/{uid}` มีจริง.
- **Impact**: user ของ tenant A ยิง order ใส่ tenant B ได้, stock ลดทันทีไม่ต้องจ่าย, ไม่มี rate limit → ตีสต็อกเป็น 0 คนซื้อจริงเจอ "สินค้าหมด" ต้องแอดมินตามยกเลิกทีละใบ.
- **Fix**: บังคับ `users/{uid}` ใต้ `tid` ใน transaction (แบบ callable อื่น) + cap unpaid order/user + พิจารณา reserve stock ตอน confirm ไม่ใช่ตอนสร้าง.

### A7 · CI ไม่ล็อกประตู deploy — push แดงก็ขึ้น production 🔴 Critical (process, แก้ถูกสุด)
- **ที่มา**: CI-1
- **Files**: `.github/workflows/firebase-deploy.yml` (push→main, **ไม่มี `needs:`**), `functions-e2e.yml`, `rules-test.yml` (workflow แยก)
- **Blast radius**: GitHub ไม่ cross-gate workflow แยกกัน → e2e/rules แดง **ไม่หยุด** `action-hosting-deploy` publish channel `live`. + deploy นี้ **hosting เท่านั้น** — functions (เงิน/แต้ม/stock ทั้งหมด) deploy มือ, e2e จึง gate อะไรไม่ได้เลย.
- **Fix**: รวม pipeline เดียว `deploy needs:[e2e,rules]` (หรือรัน test เป็น step ก่อน deploy) + เพิ่ม job deploy functions (gated) + เปิด branch protection main. **ทำได้เกือบทันที คุ้มสุด.**

### A8 · Tenant/settings อ่านได้ทั้งโลก → PII แอดมิน/ที่อยู่/PromptPay รั่ว 🟠 Medium
- **ที่มา**: SEC-6
- **Files**: `firestore.rules:32` (`tenants/{t}` read:true รวม **list**), `:37` (`settings/*`). field อ่อนไหว: `ownerLineId`/`adminLineIds`, `settings/store`(ชื่อ/เบอร์/ที่อยู่), `settings/commerce.promptpayId`. (locked ถูก: `private/*`)
- **Impact**: ใครก็ `collection('tenants').get()` enumerate ทุกแบรนด์ อ่าน LINE id แอดมิน (= UID ที่ใช้ gate) + ที่อยู่/เบอร์/PromptPay ทุกร้าน → phishing เจาะเป้า. ไม่ใช่ login bypass แต่เป็น recon + privacy.
- **Fix**: แยก branding สาธารณะ (ชื่อ/สี/โลโก้) ออกจาก ops data. ย้าย `ownerLineId`/`adminLineIds`/`settings/store` ไป doc `read: if canManage(t)`. จำกัด list `tenants`.

### A9 · Serve server-source + dev scripts สาธารณะ 🟠 Medium
- **ที่มา**: CON-1b + CON-3 + CON-7
- **Files**: `firebase.json` main(`:6`)/office(`:16`) ignore ไม่ตัด `index.js`,`apply_*.js`,`seed_tenant.js` (bocean `:26` ตัดครบ = รู้วิธีแล้วแต่ไม่ทำอีก 2 target)
- **Impact**: `index.js` (เศษ 183 บรรทัดของ functions source: auth logic, ADMIN_LINE_ID) โหลดได้ที่ `/index.js`; `seed_tenant.js`, migration scripts โหลดได้สาธารณะ. recon + เผย logic.
- **Fix**: `git rm index.js` (+ root `package.json`/lock ที่เป็น orphan) · `git rm --cached apply_*.js seed_tenant.js` · เพิ่มไฟล์พวกนี้ใน ignore ของ main/office ให้เท่า bocean.

### A10 · `tenantRequests` create ไม่ต้อง login + ไม่มี rate limit 🟠 Medium
- **ที่มา**: SEC-8
- **Files**: `firestore.rules:124-135` (create เช็คแค่ field shape, ไม่มี `signedIn()`; read/update/delete = isAdmin ถูก)
- **Impact**: ใครก็ยัด lead ขยะไม่จำกัด → สแปมคิว super-admin + ค่า write. ไม่มีข้อมูลรั่ว.
- **Fix**: บังคับ `signedIn()` + App Check หรือย้ายไป callable ที่มี rate limit ต่อ IP/uid.

### A11 · Test ความปลอดภัยมีแต่ไม่ถูกรันใน CI 🟠 High (แก้ถูก)
- **ที่มา**: CI-3
- **Files**: `functions-e2e.yml:27` รัน list มือ (7 ไฟล์), **ตก `billing.test.js` + `productmeta.test.js`** (คุม super-admin billing gate + SSRF guard)
- **Impact**: regression ที่เปิด SSRF หรือพัง billing-permission จะขึ้นเขียว. list มือ = ทุก test ใหม่ถูกตัดเงียบโดย default.
- **Fix**: รัน `tests/*.test.js` ทั้งโฟลเดอร์ (แยก rules.test.js) หรือ drive ผ่าน `npm test` ใน `tests/package.json`.

---

# กอง B — FIX-WITH-PLAN (โครงสร้าง)

> ต้องออกแบบก่อนแก้ / เป็นหนี้ยาว / scale. ทำหลัง STOP อนุมัติลำดับ.

### รากใหญ่ที่ครอบหลาย finding

### B0 · ราก A — ย้าย economic/privilege writes ไปผ่าน Cloud Function + ปิด client write 🔴 (umbrella)
เส้นความไว้ใจวางผิด. **แก้จุดเดียวยุบพร้อมกัน: A1(discountPct), A5(points), order status, coupon.** ดีไซน์: callable ที่ validate + เช็ค membership แล้ว rules `write: if false` การเขียนตรงเหล่านั้น. **สำคัญ (คมกว่า "ย้ายทุกอย่าง")**: ย้ายเฉพาะ **เงิน/แต้ม/สิทธิ์/economy-config**; ของสังคม (post/comment/like/join) **คง direct write** แต่ขัน rules validate schema/ownership — กัน cost/latency เกินจำเป็น.

### B1 · Claims-only authz ไม่มี defense-in-depth 🔴 High
- ISO-3 · `firestore.rules:8-21` · claim ผิด (เช่นจาก A4) = เข้าผิด tenant เต็มสิทธิ์ ไม่มี member-doc สำรอง. **Fix**: สำหรับ write อ่อนไหว เพิ่ม rules `get(tenants/{t}/users/{uid})` ยืนยัน + แก้ A4 ให้ claim ผิด mint ไม่ได้.

### B2 · Order lifecycle ไม่มี state machine เจ้าเดียว 🟠 Medium
- DAT-6 · transition กระจาย 3 ที่ (rules owner-path / admin `canManage` **ไม่มีเงื่อนไข** / `onOrderConfirmed` เท่านั้นที่สน 'confirmed') + mission นิยาม "paid" เป็นชุดที่ 4. แอดมิน jump `pending→shipped` ข้าม confirmed = ลูกค้าไม่ได้แต้มเงียบ. **Fix**: callable `setOrderStatus` validate `from→to` ชุดเดียว, rules ปฏิเสธ status write ตรง.

### B3 · Denormalization drift 🟠 Medium
- DAT-7 · `user.points`/`tier` มี 3 writer ไม่ประสาน (client daily-login ไม่ recompute tier, admin set ตรง); `postCount` ขึ้นอย่างเดียว (A3); `soldCount` ไม่ลดตอน `adminCancelOrder` (functions:417 คืนแค่ stock). (ที่ปลอดภัย/self-correct: likes/comments/helps/memberCount). **Fix**: points/postCount/tier = server-only, recompute tier ทุกครั้ง, ลด soldCount ตอน cancel.

### B4 · Config เศรษฐกิจไม่มี schema validation 🟠 Medium
- SEC-7 = DAT-5 · rules `write: if canManage` ไม่ validate field. **PARTIALLY MITIGATED**: server clamp/whitelist หมด (ติดลบ/crash ไม่ได้) แต่ co-admin ปั่น economy ร้านตัวเองได้ (costPoints=0, coupon สูง). + field rename เงียบ → payout ผิด. **Fix**: rules validate type/range + field dictionary กลางที่ทั้ง admin-write และ function-read ใช้ + function throw/log เมื่อ field critical หาย (ไม่ coerce เงียบ).

### B5 · `claimTenant` ใครก็ join ทุก tenant 🟠 Medium
- SEC-5 · `functions/index.js:114-129` ตั้ง `tenants[tid]=true` ไม่เช็คสิทธิ์เข้า. `memberOf` จึงไม่ใช่ boundary. **Fix**: ถ้าตั้งใจเปิด — document ไว้ว่า memberOf ไม่ใช่ security; ถ้าไม่ — gate ด้วย invite/approval หรือผูก tid กับ origin/domain.

### Scalability (จะพังเมื่อโต — ไม่ใช่ตอนนี้)

### B6 · `loadSysOverview` อ่านทุก user+order ของทุก tenant ต่อการเปิดจอ 🔴 Critical(scale)
- SCA-1 · `admin.html:1319-1338` · 50 tenant×5k = ~500k reads/เปิดจอ, ~$0.30/view + freeze. **Fix**: `count()` aggregation หรือ denormalize counter บน `tenants/{tid}` + cache.

### B7 · Hot-doc write contention บน campaign doc 🔴 Critical(scale)
- SCA-2 · `functions/index.js:189/191` (drawRef ทุก spin), `:551` (prediction) · Firestore ~1 write/s/doc → ตอน promo คนแห่ spin = transaction abort/ช้า พอดีจังหวะที่ควรปัง. **Fix**: sharded counter หรือเขียน per-spin doc แล้ว aggregate, เก็บแค่ stock decrement ใน tx.

### B8 · Whole-collection loads ไม่มี pagination 🟠 High(scale)
- SCA-4 (dashboard) + SCA-6 (products/orders/users/groups) · `.get()` ทั้ง collection แล้ว filter/sort ใน memory. `admin.html:3371`(all orders), `:1457`(all users), storefront `products.get()` โดนทุกคนซื้อ. **Fix**: `orderBy().limit()` + cursor; storefront query ตาม path (ตัด in-memory tenant filter ที่ซ้ำ).

### B9 · onSnapshot 1 listener/post + maxInstances:10 + TOCTOU quota 🟠 Medium(scale)
- SCA-7 (nearby=100 listeners), SCA-9 (cap รวมทุก callable, cold start ตอน campaign), SCA-3 (analyzePlant อ่าน-เพิ่มนอก tx → บายพาส 5/วัน = ค่า Gemini บาน). **Fix**: อ่าน stat ครั้งเดียวจาก post doc; ตั้ง maxInstances/minInstances ต่อ function; reserve quota ใน `runTransaction` ก่อนเรียก Gemini.

### Guardrails / robustness ที่ยังไม่มี

### B10 · ไม่มี error boundary / user-facing failure / retry 🟠 Medium
- ISO-7 · 118 catch/console, empty `catch(e){}` หลายจุด, ไม่มี global handler. ล้มแล้ว render ว่าง/เก่าเงียบ. A4/A5 ก็เงียบเพราะ warn อย่างเดียว. **Fix**: global boundary + telemetry, เปลี่ยน empty-catch บน load เป็น state "โหลดไม่สำเร็จ", ห้าม `catch(e){}` บน write.

### B11 · lineAuth ล่ม → ลดเป็น anonymous เงียบ 🟠 High
- ISO-2 · `index.html:1112-1117` · user LINE ที่ auth ล่มกลายเป็น anon ไม่มี claim → ทุก action ถูก requireLogin บล็อก วนไม่จบ เห็นแค่ console.warn. **Fix**: ถ้า `liff.isLoggedIn()` อย่า fallback anon; แสดง error/retry จริง.

### B12 · ไม่มี observability (log/monitor/alert) 🟠 Medium
- CI-6 · มีแต่ `console.*`, trigger `.catch(()=>{})` กลืน error → counter/points drift มองไม่เห็น. **Fix**: `firebase-functions/logger` structured (tid/uid/fn) + Error Reporting + alert error-rate + validate `req.data` shape ตอนเข้า (ไม่ coerce).

### B13 · Frontend + storage.rules = 0 test 🟠 High
- CI-4 (frontend), CI-5 (storage) · ตรรกะ checkout/tenant-select/admin ไม่มี backstop; storage rules (slip privacy, product-image authz) ไม่มีเทสต์. **Fix**: DOM/unit harness (jsdom/Playwright) จับ payload placeOrder + tenant-resolve; `storage.rules.test.js` + เพิ่ม storage emulator. wire เข้า pipeline (A7).

### B14 · SSRF DNS-rebind residual 🟠 Low
- SEC-13 · `isSafePublicUrl` เช็ค hostname string ไม่เช็ค resolved IP + ตาม redirect (admin-only จำกัดผล). **Fix**: resolve DNS แล้วเช็ค IP กับ blocklist ก่อน fetch.

### หนี้โครงสร้างระยะยาว + hygiene

### B15 · Monolith split (เกมยาว — อย่ารีบรื้อ) 🟠
- index.html 4,286 / admin.html 3,580 บรรทัด, JS ฝัง HTML, ไม่มี module. **ลำดับถูกคือ "ล้อมด้วย test ก่อน (B13) แล้วค่อยผ่าเป็นส่วน"** ไม่ใช่รื้อทันที.

### B16 · Duplication debt 🟠 Medium
- CON-4 · (d) admin CRUD toggle/delete/load ซ้ำ 4 collection + (e) settings get/set boilerplate ~30 ครั้ง = ตัวที่จะกัดจริง; (a) address form 3 ที่; (b) province loop 2; (f) badge array 2. **Fix**: `crudActions()` factory + `getSetting/saveSetting` helper (ทำตอนแตะแต่ละส่วน).

### B17 · Dead code + hygiene 🎨/🟠 Low
- CON-5 `likePost`(index:3224), `ADMIN_LINE_ID`(admin:1179), config.js sample arrays; CON-2 `public/` = fork เก่าคนละแอป (ลบได้, แต่ตอนนี้ serve ที่ `/public/`); CON-1 root package.json orphan (node20 vs 22); CON-6 `loadCampaigns` โหลด `missions` (naming landmine). **Fix**: ลบทั้งหมด (zero-risk) + align node เป็น 22.

---

## ตารางสรุป (severity × กอง)

| กอง | Critical | High | Medium | Low |
|---|---|---|---|---|
| **A (fix-now)** | A1,A2,A3,A4,A7 | A5,A6,A11 | A8,A9,A10 | — |
| **B (structural)** | B6,B7 (scale) | B1,B8,B11,B13 | B2,B3,B4,B5,B9,B10,B12,B16 | B14,B17 |

## หักล้าง/ลดระดับ (ไม่นับเป็นปัญหา)
- adminLineIds privesc (SEC-9 **REFUTED** — owner+hasOnly) · self-confirm points farm (ISO-6 **REFUTED** — rules กัน confirmed) · loadFeed cross-tenant (SCA-8 **REFUTED** — post แยก path) · client isAdmin() write (SEC-10 — canManage กัน) · lineAuth exchange (SEC-12 sound) · admin.html public (SEC-11 → Low, recon เท่านั้น) · สูตรราคา 2 ชุด (DAT-4 — ตรงกันวันนี้, blast แค่ preview) · optimistic UI drift (ISO-5 — self-heal ตอน reload) · node mismatch (CI-7 — prod runtime ตรง, แค่ root orphan)
