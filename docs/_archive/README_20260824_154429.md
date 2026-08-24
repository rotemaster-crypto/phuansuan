# เพื่อนสวน — Phuansuan App

## ภาพรวมโปรเจกต์
Social network สำหรับชาวสวนและเกษตรกรไทย
เป้าหมาย: ให้ชาวสวนแชร์ปัญหา โรคพืช และความรู้
ร้านค้า: DemeterRich ผู้ผลิตปุ๋ยเหลว

## กลุ่มเป้าหมาย
อายุ 35-60 ปี ใช้ Facebook เป็น คุ้นเคย UI แบบ Facebook

## Tech Stack
- Frontend: HTML + Vanilla JS + CSS (single file)
- Backend: Firebase (project: phuansuan)
- Database: Firestore
- Storage: Firebase Storage
- Hosting: Firebase Hosting → phuansuan.web.app
- Auth: Line Login (LIFF)
- AI: Gemini Vision API (วิเคราะห์โรคพืช)
- Config: config.js (แก้ไขได้โดยไม่แตะ index.html)

## Firebase Config
- Project ID: phuansuan
- Auth Domain: phuansuan.firebaseapp.com
- Storage: phuansuan.firebasestorage.app

## Development Environment
- IDE: GitHub Codespaces (browser-based)
- Repo: rotemaster-crypto/phuansuan
- Deploy: firebase deploy จาก Terminal

## UI/UX
- สไตล์: Facebook Mobile (โทนขาว + น้ำเงิน #1877f2)
- Mobile-first: max-width 480px
- ภาษา: ไทยทั้งหมด
- ไม่ใช้ framework ใดๆ (Vanilla JS เท่านั้น)

## ฟีเจอร์ MVP (เรียงลำดับ build)
1. Login ผ่าน Line
2. โพสภาพ + พืช + พิกัด
3. Feed ตามพิกัด
4. AI วิเคราะห์โรคพืช
5. Like + Comment
6. Point system
7. Profile + Badge
8. Community/กลุ่ม

## Core Values
- ชุมชนแห่งการแบ่งปัน
- ปราชญ์ชาวสวน (คนอยากโชว์ความรู้)
- ส่วนลดจากแต้มสะสม

## กฎการทำงาน
- เสนอก่อนเสมอ รออนุมัติก่อน build
- ทุกการเปลี่ยนแปลงต้องแก้ผ่าน config.js ถ้าทำได้
- code ต้อง deploy ได้ทันทีด้วย firebase deploy
- อธิบายเป็นภาษาไทยเสมอ
