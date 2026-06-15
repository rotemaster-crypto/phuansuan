# เพื่อนสวน (Phuansuan) — Phase 2 Complete

## สถานะ: ✅ Phase 2 เสร็จสมบูรณ์ ปรับใช้งานจริงที่ phuansuan.web.app

---

## สิ่งที่ทำเสร็จใน Phase 2

### Step 1 — Follow / Unfollow ✅
- Subcollection `users/{uid}/following/{targetId}`
- ปุ่ม Follow ในโพส (เฉพาะโพสคนอื่น)
- Tab "รายการโปรด" → loadFeed('following')
- เพิ่ม followers counter ใน Firestore
- Firestore rules: following subcollection + allow update followers field

### Step 2 — Auto Badges ✅
- `computeBadges()`, `checkAndSaveBadges()`, `renderBadgesUI()`
- Badge ตาม tier (Bronze/Silver/Gold/Platinum)
- Badge พิเศษ: ปราชญ์มะม่วง (20 โพส), เพื่อนบ้านที่ดี (ช่วย 10), นักแจ้งเตือน (5 alerts), ปราชญ์ชาวสวน (ช่วย 50)
- บันทึกใน `users.badges[]` (ไม่ลบ badge ที่ได้แล้ว)

### Step 3 — Real-time Feed + Pagination ✅
- Feed หลักใช้ `onSnapshot` (real-time)
- Banner "🌿 มีโพสใหม่ X รายการ" เมื่อมีโพสใหม่
- "โหลดโพสเพิ่มเติม ↓" ด้วย startAfter cursor (PAGE_SIZE=10)
- nearby/following ใช้ one-shot query
- State vars: feedUnsubscribe, feedLastDoc, feedMode, feedNewCount

### Step 4 — Server-side Points (anti-cheat) ✅
- ลบ client-side point increments ทั้งหมดออกจากโพส/like/comment/help
- Cloud Functions triggers ใน `functions/index.js`:
  - `onPostCreated` → +10pt (หรือ +15 ถ้ามีรูป) + postCount++
  - `onCommentCreated` → +3pt
  - `onPostHelped` → +15pt + helpCount++ (ให้เจ้าของโพส)
- แต่ละ trigger เรียก `calcTier()` / `updateTier()` อัตโนมัติ
- Points values ต้องตรงกับ config.js (perPost:10, perPostWithImg:15, perComment:3, perHelp:15)

### Step 5 — AI Doctor Bug Fix ✅
- Gemini 2.5 Flash ตัด JSON กลางคัน → parse fail
- แก้ใน functions/index.js: maxOutputTokens 800→2048, responseMimeType:"application/json", thinkingBudget:0
- เพิ่ม try/catch JSON.parse พร้อม fallback message

### Step 6 — Web Push + In-app Notifications ✅
- `firebase-messaging-sw.js` (background handler + notificationclick)
- Firebase Messaging SDK ใน index.html head
- VAPID_KEY: `f3S75Zzlpoi9BfY_AUL2uwL-LKKk-Zz8stskYSsygwA`
- Notification bell 🔔 + badge แดง + panel dropdown
- `initFCM()`, `requestPushPermission()`, `saveFcmToken()` → บันทึกใน users.fcmToken
- `listenNotifications()` (real-time unread count)
- Functions triggers: `onCommentNotify`, `onHelpNotify`, `onTierUpgrade`
- Firestore rules: notifications collection (owner read/update read field only)

### Step 7 — PWA Install Banner ✅
- Banner สีดำเด้งขึ้นหลัง 3 วินาที (ครั้งแรก)
- ปุ่ม "📲 เพิ่มที่หน้าจอหลัก" + "ไม่ใช่ตอนนี้"
- `beforeinstallprompt` event capture
- `localStorage('installDismissed')` ป้องกัน banner ซ้ำ
- ซ่อนเมื่อเปิดจาก Home Screen (standalone mode)
- `manifest.json` + meta tags PWA + icons/ (192, 512, badge-72)

### Step 8 — Profile Avatar + Cover Photo ✅
- **Avatar อยู่หน้าภาพปก**: `.prof-av-row` z-index:10, `.prof-av` z-index:10, position:relative
- **ปุ่มแก้ไขรูปหน้าปกทำงาน**: input file จริง + onclick trigger
- ลบ `overflow:hidden` จาก `.prof-cover` + ใส่ wrapper `position:relative`
- `uploadCoverPhoto()`: compress → upload covers/{uid}_cover.jpg → save users.coverUrl → แสดงทันที
- `updateUIWithUser()` โหลด coverUrl จาก Firestore
- storage.rules: เพิ่ม covers/ path

---

## ไฟล์หลักที่แก้ไขใน Phase 2
| ไฟล์ | การเปลี่ยนแปลง |
|---|---|
| `index.html` | Follow, badges, real-time feed, notifications UI, install banner, cover photo, avatar z-index |
| `functions/index.js` | Point triggers, AI fix, notification triggers |
| `firestore.rules` | following subcollection, notifications collection |
| `storage.rules` | เพิ่ม covers/ path |
| `firebase-messaging-sw.js` | FCM background handler (ไฟล์ใหม่) |
| `manifest.json` | PWA manifest (ไฟล์ใหม่) |
| `icons/` | icon-192.png, icon-512.png, badge-72.png (ไฟล์ใหม่) |
| `firebase-config.js` | เพิ่ม VAPID_KEY |

---

## Key Info
- **Firebase Project:** phuansuan (Blaze plan)
- **Hosting:** https://phuansuan.web.app
- **LIFF ID:** 2010356906-9iRWpDO2
- **Admin LINE ID:** U03582167674331d9005dfb42728c7151
- **FCM VAPID Key:** f3S75Zzlpoi9BfY_AUL2uwL-LKKk-Zz8stskYSsygwA
- **Codespace:** studious-acorn-jjxjvw6v7wg72qw5j.github.dev
- **Repo:** github.com/rotemaster-crypto/phuansuan

---

## วิธีการทำงานที่เรียนรู้ (สำคัญมาก)
- Claude แก้ไฟล์ใน `/mnt/project/` (สำเนา) → **ไม่เข้า Codespace อัตโนมัติ**
- ต้องส่งเป็น **base64 node patch script** ให้ Roger รันใน Codespace terminal
- แล้วค่อย `firebase deploy` + `git add -A && git commit && git push`
- ถ้าเจอ `nothing to commit` แปลว่า patch ยังไม่ได้รัน

---

## Phase 3 — สิ่งที่จะทำต่อ (เรียงลำดับ)
1. 🏘️ **Community/กลุ่ม** — สร้างกลุ่ม, join, feed แยกตามกลุ่ม
2. 📍 **Proximity Alert** — แจ้งเตือนโรคพืชระบาดในพื้นที่ใกล้
3. 🛒 **เชื่อม LINE Shop** — ลิงก์ซื้อปุ๋ย DemeterRich จากในแอป
4. 🎁 **Tier Redeem** — ใช้แต้มแลกส่วนลด
5. 📊 **Store Admin Dashboard** — สถิติร้านค้า

---

## Known Issues (ยังไม่แก้)
- Node.js 20 deprecated ต.ค. 2569 → ควร upgrade เป็น Node 22 ก่อน launch
- `followers` counter ยังเป็น client-writable (ยอมรับได้ MVP)
- ไฟล์ซ้ำที่ root repo (index_2.html, root index.js) → cleanup ก่อน launch
- Stories bar ยังเป็น mock data
- LINE Channel Secret เคยอยู่ใน PROGRESS_1.md บน GitHub → ควร reissue ก่อน launch
