# Bocean — โน้ตแบรนด์ & วิธีใช้ไฟล์

## สี (แก้ได้ตรง ๆ ในไฟล์ .svg)
| บทบาท        | HEX       | ใช้ที่ไหน                          |
|--------------|-----------|-----------------------------------|
| Deep navy    | `#1B3B5C` | พื้นไอคอน / เส้นโค้งบนพื้นสว่าง / ตัวอักษร "ocean" |
| Aqua         | `#22B8D8` | เส้นโค้งชั้นในสุด + จุดกลาง / ตัวอักษร "B"        |
| White        | `#FFFFFF` | เส้นโค้ง 2 ชั้นนอกบนพื้นเข้ม        |

> อยากเปลี่ยนสี: เปิดไฟล์ .svg ด้วย text editor แล้ว find & replace ค่า hex ได้เลย
> (ทุกไฟล์มีคอมเมนต์บอกสีไว้บรรทัดบนสุด)

## ไฟล์ในชุดนี้
**เวกเตอร์ (แก้ต่อได้ — เปิดใน Figma / Illustrator / Inkscape / โค้ด)**
- `bocean-icon.svg` — ไอคอนหลัก (พื้นน้ำเงินเข้ม) ใช้เป็น app icon / โซเชียล
- `bocean-icon-light.svg` — สำหรับวางบนพื้นสว่าง (เส้นน้ำเงิน พื้นโปร่ง)
- `bocean-icon-mono.svg` — สีเดียว ใช้ `currentColor` เปลี่ยนสีตามข้อความที่ครอบ
- `bocean-logo-horizontal.svg` — ไอคอน + คำว่า Bocean (แนวนอน) ใช้บนหัวเว็บ/เอกสาร
- `bocean-logo-stacked.svg` — ไอคอนวางบนคำว่า Bocean (แนวตั้ง)

**PNG / favicon (ใช้ได้ทันที)**
- `bocean-512.png`, `bocean-192.png` — PWA / manifest
- `bocean-180.png` — Apple touch icon
- `bocean-32.png`, `bocean-16.png` — favicon
- `favicon.ico` — favicon แบบรวมหลายขนาด

## วางในเว็บแอป (ใส่ใน <head>)
```html
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="32x32" href="/bocean-32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/bocean-16.png">
<link rel="apple-touch-icon" sizes="180x180" href="/bocean-180.png">
```

## manifest.json (PWA)
```json
"icons": [
  { "src": "/bocean-192.png", "sizes": "192x192", "type": "image/png" },
  { "src": "/bocean-512.png", "sizes": "512x512", "type": "image/png" }
]
```

## ฟอนต์คำว่า Bocean
โลโก้แนวนอน/แนวตั้งตั้งเป็น live text ด้วยฟอนต์ระบบ (Segoe UI / Roboto / Arial)
ถ้าจะใช้เป็นโลโก้จริงจัง แนะนำเลือกฟอนต์ตายตัว 1 ตัว แล้ว "convert to outline"
เพื่อให้แสดงผลเหมือนกันทุกเครื่อง — บอกได้ถ้าอยากให้ผมช่วยเลือกฟอนต์
