# Bocean Theme Presets

แปลงจาก design references (`reference/`) เป็นค่าตัวแปร CSS ที่ Bocean ใช้ได้ทันที
แต่ละ preset = ชุดค่าของ `--primary --accent --bg --card --border --text --muted` + font + radius

- ตัวแปรหลักของแอป (`index.html :root`): `--primary --accent --bg --card --border --text --muted`
- ตัวแปร `bocean.html` (`:root`): `--pri --pri2 --ink --muted --line --bg --ok`

---

## 1) Voltage — จาก ClickHouse ★ ค่ามาตรฐานของ bocean.html
แนว: ดำสนิท + เหลืองไฟฟ้า · สาย SaaS/platform/engineer · contrast สูง

```css
:root{
  --primary:#faff69;       /* electric yellow — CTA + ตัวเลขสถิติ */
  --primary-active:#e6eb52;
  --accent:#22c55e;        /* emerald — success */
  --bg:#0a0a0a;            /* canvas ดำ */
  --card:#1a1a1a;          /* surface card */
  --card-elevated:#242424;
  --border:#2a2a2a;        /* hairline */
  --text:#ffffff;
  --muted:#888888;
  --on-primary:#0a0a0a;    /* ข้อความบนปุ่มเหลือง = ดำ */
}
```
- Font: Inter (display 700 / ปุ่ม 600 / body 400) · code: JetBrains Mono
- Radius: ปุ่ม 8px · การ์ด 12px
- Signature: ตัวเลขสถิติใหญ่สีเหลือง + แถบ CTA เหลืองเต็มกว้าง (ข้อความดำ)

## 2) Merchant — จาก Meta
แนว: ขาวสะอาด + cobalt · ปุ่ม pill · ภาพสินค้านำ · เหมาะแบรนด์ commerce ที่มีภาพเยอะ

```css
:root{
  --primary:#0064e0;       /* cobalt — ปุ่มซื้อ */
  --primary-active:#0a4ea8;
  --accent:#1877f2;
  --bg:#ffffff;
  --card:#ffffff;
  --surface-soft:#f1f4f7;
  --border:#e4e6eb;
  --text:#1c2b33;
  --muted:#65676b;
  --on-primary:#ffffff;
}
```
- Font: Inter / Montserrat (แทน Optimistic VF — proprietary)
- Radius: ปุ่ม pill (999px) · การ์ดโชว์ 32px
- Signature: ภาพสินค้า full-bleed ไม่มี chrome การ์ด · ปุ่ม pill ดำ(marketing)/cobalt(ซื้อ)

## 3) Editorial — จาก Shopify
แนว: 2 แทร็ก (ดำ cinematic + ครีมขาว) · display บาง · เขียว aloe · เหมาะแบรนด์ premium/storytelling

```css
:root{
  --primary:#000000;       /* ปุ่ม pill ดำ (light track) */
  --accent:#c1fbd4;        /* aloe — featured/growth */
  --accent-soft:#d4f9e0;   /* pistachio */
  --bg:#fbfbf5;            /* cream */
  --bg-night:#000000;      /* cinematic track */
  --card:#ffffff;
  --border:#e4e4e7;
  --text:#000000;
  --muted:#71717a;
  --on-primary:#ffffff;
}
```
- Font: Inter (แทน Neue Haas Grotesk — proprietary; display ใช้ weight บาง 300–400)
- Radius: ปุ่ม pill ล้วน · ไม่มีปุ่มเหลี่ยม
- Signature: ภาพ full-bleed · 1 action ต่อแถบ · display บางตัวใหญ่ · aloe เฉพาะแทร็กขาว

---

## วิธีใช้
1. เลือก preset → ก็อปบล็อก `:root` ไปแทนใน `index.html` (ต่อ tenant ใช้ผ่าน `settings/app` + `applyConfig`)
2. `bocean.html` ใช้ **Voltage** เป็นค่ามาตรฐาน
3. Font: Inter / JetBrains Mono / Montserrat โหลดจาก Google Fonts หรือ fontsource

## License
- ✅ Inter · JetBrains Mono · Montserrat = ฟรี (OFL)
- ❌ Optimistic VF (Meta) · Neue Haas Grotesk (Shopify) = proprietary → substitute แล้วในตารางบน
- preset เป็นธีม Bocean ที่ได้แรงบันดาลใจจาก design เหล่านี้ ไม่ใช่การอ้างเป็นแบรนด์ต้นทาง
